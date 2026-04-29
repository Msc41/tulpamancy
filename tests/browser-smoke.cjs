const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const viewports = [
  { width: 390, height: 844 },
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
      assert.equal(await page.getByText(/还没有消息|从第一句话开始/).count(), 0);
      const homeLayout = await page.evaluate(() => {
        const app = document.querySelector('#app');
        const homeHeader = document.querySelector('.home-header');
        const bottomNav = document.querySelector('.bottom-nav');
        return {
          appWidth: Math.round(app.getBoundingClientRect().width),
          appHeight: Math.round(app.getBoundingClientRect().height),
          homeHeaderHeight: Math.round(homeHeader.getBoundingClientRect().height),
          bottomNavHeight: Math.round(bottomNav.getBoundingClientRect().height),
        };
      });
      assert.deepEqual(homeLayout, {
        appWidth: 390,
        appHeight: 844,
        homeHeaderHeight: 91,
        bottomNavHeight: 49,
      });

      await page.locator('[data-action="open-account-panel"]').click();
      await assertVisibleText(page, '切换账号');
      await assertVisibleText(page, '导出 JSON 备份');
      await page.getByRole('button', { name: '完成' }).click();

      await page.getByRole('button', { name: '联系人', exact: true }).click();
      await assertVisibleText(page, '联系人');
      await page.locator('[data-action="open-contact"]').first().click();

      await page.locator('#draft').fill('A 视角发出的第一条');
      await page.getByRole('button', { name: '发送' }).click();
      await page.locator('#draft').fill('当前账号继续发送');
      await page.getByRole('button', { name: '发送' }).click();
      await page.locator('.message-row').nth(1).waitFor();

      for (let index = 0; index < 24; index += 1) {
        await page.locator('#draft').fill(`连续消息 ${index + 1}`);
        await page.getByRole('button', { name: '发送' }).click();
      }

      const before = await readMessages(page);
      const hasSwapButton = await page.getByRole('button', { name: '切换到对方账号' }).count();
      const senderToggleCount = await page.locator('.sender-toggle, [data-action="set-sender"]').count();
      const emptyPrompts = await page.getByText(/还没有消息|从第一句话开始/).count();
      const overflow = await page.evaluate(() => ({
        bodyScrollWidth: document.body.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        appScrollWidth: document.querySelector('#app').scrollWidth,
        appClientWidth: document.querySelector('#app').clientWidth,
      }));
      const chatLayout = await page.evaluate(() => {
        const screen = document.querySelector('.screen-chat');
        const chatbar = document.querySelector('.chatbar');
        const messages = document.querySelector('.messages');
        const composer = document.querySelector('.composer');
        const screenRect = screen.getBoundingClientRect();
        const chatbarRect = chatbar.getBoundingClientRect();
        const messagesRect = messages.getBoundingClientRect();
        const composerRect = composer.getBoundingClientRect();
        return {
          screenHeight: Math.round(screenRect.height),
          screenWidth: Math.round(screenRect.width),
          viewportHeight: window.innerHeight,
          chatbarHeight: Math.round(chatbarRect.height),
          chatbarTop: Math.round(chatbarRect.top - screenRect.top),
          messagesCanScroll: messages.scrollHeight > messages.clientHeight,
          messagesTop: Math.round(messagesRect.top - screenRect.top),
          messagesBottom: Math.round(messagesRect.bottom - screenRect.top),
          composerTop: Math.round(composerRect.top - screenRect.top),
          composerBottom: Math.round(composerRect.bottom - screenRect.top),
        };
      });
      const focusLayout = await page.evaluate(async () => {
        const screen = document.querySelector('.screen-chat');
        const chatbar = document.querySelector('.chatbar');
        const draft = document.querySelector('#draft');
        const before = {
          scrollY: Math.round(window.scrollY),
          chatbarTop: Math.round(chatbar.getBoundingClientRect().top - screen.getBoundingClientRect().top),
        };
        draft.focus();
        await new Promise((resolve) => setTimeout(resolve, 180));
        return {
          before,
          after: {
            scrollY: Math.round(window.scrollY),
            chatbarTop: Math.round(chatbar.getBoundingClientRect().top - screen.getBoundingClientRect().top),
          },
        };
      });
      const chatBackgrounds = await page.evaluate(() => {
        const screen = document.querySelector('.screen-chat');
        const messages = document.querySelector('.messages');
        const expectedColor = getComputedStyle(document.documentElement)
          .getPropertyValue('--qq-canvas')
          .trim();
        const probe = document.createElement('div');
        probe.style.background = expectedColor;
        document.body.append(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
          expected,
          screen: getComputedStyle(screen).backgroundColor,
          messages: getComputedStyle(messages).backgroundColor,
        };
      });

      assert.equal(before.at(0).text, 'A 视角发出的第一条');
      assert.equal(before.at(0).side, 'outgoing');
      assert.equal(before.at(1).text, '当前账号继续发送');
      assert.equal(before.at(1).side, 'outgoing');
      assert.equal(hasSwapButton, 0);
      assert.equal(senderToggleCount, 0);
      assert.equal(emptyPrompts, 0);
      assert.equal(errors.length, 0);
      assert.ok(overflow.bodyScrollWidth <= overflow.viewportWidth, 'body should not overflow horizontally');
      assert.ok(overflow.appScrollWidth <= overflow.appClientWidth, 'app should not overflow horizontally');
      assert.equal(chatLayout.screenWidth, 390, 'chat screen should use iPhone 14 width');
      assert.equal(chatLayout.screenHeight, 844, 'chat screen should use iPhone 14 height');
      assert.equal(chatLayout.chatbarHeight, 44, 'chatbar should use iPhone navigation bar height');
      assert.equal(chatLayout.chatbarTop, 47, 'chatbar should stay below the fixed status bar');
      assert.ok(chatLayout.messagesCanScroll, 'messages area should scroll independently');
      assert.ok(chatLayout.messagesTop > chatLayout.chatbarTop, 'messages should be below chatbar');
      assert.ok(chatLayout.messagesBottom <= chatLayout.composerTop + 1, 'messages should end before composer');
      assert.ok(chatLayout.composerBottom <= chatLayout.screenHeight + 1, 'composer should stay within chat screen');
      assert.equal(focusLayout.before.scrollY, 0, 'page should start unscrolled');
      assert.equal(focusLayout.after.scrollY, 0, 'focusing draft should not scroll the page');
      assert.equal(focusLayout.after.chatbarTop, 47, 'chatbar should remain fixed after focusing draft');
      assert.equal(chatBackgrounds.screen, chatBackgrounds.expected, 'chat screen background should match home background');
      assert.equal(chatBackgrounds.messages, chatBackgrounds.expected, 'messages background should match home background');

      results.push({ viewport, fixedChatLayout: true, overflow, homeLayout, chatLayout, focusLayout, chatBackgrounds });
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
