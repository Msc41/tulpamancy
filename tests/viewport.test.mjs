import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveViewportMetrics } from '../src/viewport.mjs';

test('keeps the full app height when the visual viewport shrinks for keyboard', () => {
  const metrics = resolveViewportMetrics({
    previousHeight: 844,
    windowInnerHeight: 844,
    visualViewportHeight: 520,
    visualViewportOffsetTop: 0,
    isTextInputFocused: true,
  });

  assert.equal(metrics.layoutHeight, 844);
  assert.equal(metrics.keyboardInset, 324);
});

test('still detects keyboard when the browser reports a smaller innerHeight while focused', () => {
  const metrics = resolveViewportMetrics({
    previousHeight: 844,
    windowInnerHeight: 520,
    visualViewportHeight: 520,
    visualViewportOffsetTop: 0,
    isTextInputFocused: true,
  });

  assert.equal(metrics.layoutHeight, 844);
  assert.equal(metrics.keyboardInset, 324);
});

test('updates the app height for a real viewport resize when input is not focused', () => {
  const metrics = resolveViewportMetrics({
    previousHeight: 844,
    windowInnerHeight: 932,
    visualViewportHeight: 932,
    visualViewportOffsetTop: 0,
    isTextInputFocused: false,
  });

  assert.equal(metrics.layoutHeight, 932);
  assert.equal(metrics.keyboardInset, 0);
});
