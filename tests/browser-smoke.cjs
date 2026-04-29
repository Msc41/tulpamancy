const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const viewports = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

(async () => {
  let browser;
  try {
    browser = await chromium.launch({
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
      serviceWorkers: 'block',
      });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') {
          errors.push(message.text());
        }
      });

      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.locator('.bottom-nav button').first().waitFor();
      const navLabels = await page.locator('.bottom-nav button').evaluateAll((buttons) => (
        buttons.map((button) => button.getAttribute('aria-label'))
      ));
      assert.deepEqual(navLabels, ['消息', '联系人']);

      await page.locator('[data-action="open-account-panel"]').click();
      await assertVisibleText(page, '切换账号');
      await assertVisibleText(page, '导出 JSON 备份');
      await page.getByRole('button', { name: '完成' }).click();

      await page.getByRole('button', { name: '联系人', exact: true }).click();
      await assertVisibleText(page, '联系人');
      await page.locator('[data-action="open-contact"]').first().click();

      await page.locator('#draft').fill('A 视角发出的第一条');
      await page.getByRole('button', { name: '发送' }).click();
      await page.locator('[data-action="set-sender"]').last().click();
      await page.waitForFunction(() => (
        document.querySelectorAll('[data-action="set-sender"]')[1]?.classList.contains('active')
      ));
      await page.locator('#draft').fill('B 手动回复');
      await page.getByRole('button', { name: '发送' }).click();
      await page.locator('.message-row').nth(1).waitFor();

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

    console.log(JSON.stringify(results, null, 2));
  } finally {
    if (browser) {
      await browser.close();
    }
  }
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

async function assertVisibleText(page, text) {
  assert.ok(await page.getByText(text).first().isVisible(), `"${text}" should be visible`);
}
