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
