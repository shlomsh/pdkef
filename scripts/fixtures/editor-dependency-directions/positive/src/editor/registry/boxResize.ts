// Fixture stand-in for the real src/editor/registry/boxResize.ts: exercises
// the single-owner rule (exactly one file under src/ may mention these two
// names) so the "positive" fixture models a fully valid tree, not only a
// tree with no owner at all.
export function computeBoxResize(start: { left: number; top: number }) {
  const maxWidthFromRightGrowth = 100 - start.left;
  const maxHeightFromBottomGrowth = 100 - start.top;
  return { maxWidthFromRightGrowth, maxHeightFromBottomGrowth };
}
