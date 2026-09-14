export function computeBoxResize(start: { left: number; top: number }) {
  const maxWidthFromRightGrowth = 100 - start.left;
  const maxHeightFromBottomGrowth = 100 - start.top;
  return { maxWidthFromRightGrowth, maxHeightFromBottomGrowth };
}
