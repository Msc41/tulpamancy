import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('layout uses fixed iPhone 14 chrome dimensions', () => {
  const root = findRuleBlock(':root');
  assert.match(root, /--iphone-w:\s*390px;/);
  assert.match(root, /--iphone-h:\s*844px;/);
  assert.match(root, /--statusbar-h:\s*47px;/);
  assert.match(root, /--navbar-h:\s*44px;/);
  assert.match(root, /--tabbar-h:\s*49px;/);

  const shell = findRuleBlock('.app-shell');
  assert.match(shell, /width:\s*var\(--iphone-w\);/);
  assert.match(shell, /height:\s*var\(--iphone-h\);/);

  const chat = findRuleBlock('.screen-chat');
  assert.match(chat, /height:\s*var\(--iphone-h\);/);
  assert.match(chat, /overflow:\s*hidden;/);
});

function findRuleBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `${selector} rule should exist`);
  return match[1];
}
