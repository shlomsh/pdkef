/**
 * The vertical shift that makes a pinch preview obey the rule the lamp's board obeys at rest. A column at least as
 * tall as the content box covers it (top at or above the content top, bottom at or below the content bottom: the
 * range the scroll can reach); a shorter one is centred in it. Screen px; `viewTop` is the workspace's top edge.
 */
export function previewShiftY(
  scaledTop: number,
  scaledHeight: number,
  viewTop: number,
  viewHeight: number,
  padTop: number,
  padBottom: number,
): number {
  const contentTop = viewTop + padTop;
  const contentBottom = viewTop + viewHeight - padBottom;
  if (scaledHeight < contentBottom - contentTop) return contentTop + (contentBottom - contentTop - scaledHeight) / 2 - scaledTop;
  if (scaledTop > contentTop) return contentTop - scaledTop;
  const bottom = scaledTop + scaledHeight;
  return bottom < contentBottom ? contentBottom - bottom : 0;
}

/**
 * The horizontal mirror of `previewShiftY`, for the board's rule at rest: a column at least as wide as the content box
 * covers it (left at or before the content left, right at or after the content right); a narrower one is centred.
 * Screen px; `viewLeft` is the workspace's left edge.
 */
export function previewShiftX(
  scaledLeft: number,
  scaledWidth: number,
  viewLeft: number,
  viewWidth: number,
  padLeft: number,
  padRight: number,
): number {
  const contentLeft = viewLeft + padLeft;
  const contentRight = viewLeft + viewWidth - padRight;
  if (scaledWidth < contentRight - contentLeft) return contentLeft + (contentRight - contentLeft - scaledWidth) / 2 - scaledLeft;
  if (scaledLeft > contentLeft) return contentLeft - scaledLeft;
  const right = scaledLeft + scaledWidth;
  return right < contentRight ? contentRight - right : 0;
}
