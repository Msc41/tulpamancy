const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const viewports = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  const results = [];

  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /她/ }).first().click();

    await page.getByRole('textbox', { name: '' }).fill('A 视角发出的第一条');
    await page.getByRole('button', { name: '发送' }).click();
    await page.getByRole('button', { name: '她' }).click();
    await page.getByRole('textbox', { name: '' }).fill('B 手动回复');
    await page.getByRole('button', { name: '发送' }).click();

    const before = await readMessages(page);
    await page.getByRole('button', { name: '切换到对方账号' }).click();
    await page.waitForTimeout(150);
    const after = await readMessages(page);
    const overflow = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      appScrollWidth: document.querySelector('#app').scrollWidth,
      appClientWidth: document.querySelector('#app').clientWidth,
    }));

    assert.deepEqual(before, [
      { side: 'outgoing', text: 'A 视角发出的第一条' },
      { side: 'incoming', text: 'B 手动回复' },
    ]);
    assert.deepEqual(after, [
      { side: 'incoming', text: 'A 视角发出的第一条' },
      { side: 'outgoing', text: 'B 手动回复' },
    ]);
    assert.equal(errors.length, 0);
    assert.ok(overflow.bodyScrollWidth <= overflow.viewportWidth, 'body should not overflow horizontally');
    assert.ok(overflow.appScrollWidth <= overflow.appClientWidth, 'app should not overflow horizontally');

    results.push({ viewport, messagesMirror: true, overflow });
    await context.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});

async function readMessages(page) {
  return page.locator('.message-row').evaluateAll((rows) => rows.map((row) => ({
    side: row.classList.contains('outgoing') ? 'outgoing' : 'incoming',
    text: row.querySelector('.bubble').innerText,
  })));
}
