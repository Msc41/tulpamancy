const KEYBOARD_THRESHOLD = 80;

export function resolveViewportMetrics({
  previousHeight = 0,
  windowInnerHeight = 0,
  visualViewportHeight = 0,
  visualViewportOffsetTop = 0,
  isTextInputFocused = false,
} = {}) {
  const rawHeight = Math.round(windowInnerHeight || visualViewportHeight || previousHeight || 0);
  const visualHeight = Math.round(visualViewportHeight || rawHeight);
  const offsetTop = Math.max(0, Math.round(visualViewportOffsetTop || 0));
  const baseHeight = Math.round(previousHeight || rawHeight || visualHeight);
  const browserViewportDelta = Math.max(0, rawHeight - visualHeight - offsetTop);
  const focusedViewportDelta = isTextInputFocused
    ? Math.max(0, baseHeight - visualHeight - offsetTop)
    : 0;
  const keyboardLikely = browserViewportDelta > KEYBOARD_THRESHOLD
    || focusedViewportDelta > KEYBOARD_THRESHOLD;

  if (!keyboardLikely) {
    return {
      layoutHeight: rawHeight || visualHeight || baseHeight,
      keyboardInset: 0,
    };
  }

  return {
    layoutHeight: baseHeight,
    keyboardInset: Math.max(browserViewportDelta, focusedViewportDelta),
  };
}
