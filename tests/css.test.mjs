import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('critical viewport containers keep a vh fallback before dvh', () => {
  assertBlockHasHeightFallback('body');
  assertBlockHasHeightFallback('.app-shell');
});

function assertBlockHasHeightFallback(selector) {
  const block = findRuleBlock(selector);
  const fallbackIndex = block.indexOf('100vh');
  const dynamicIndex = block.indexOf('100dvh');
  assert.ok(fallbackIndex >= 0, `${selector} should include a 100vh fallback`);
  assert.ok(dynamicIndex >= 0, `${selector} should include a 100dvh value`);
  assert.ok(fallbackIndex < dynamicIndex, `${selector} should declare 100vh before 100dvh`);
}

function findRuleBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `${selector} rule should exist`);
  return match[1];
}
