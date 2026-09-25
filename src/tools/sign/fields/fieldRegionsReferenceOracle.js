/**
 * Frozen reference oracle for `fieldRegions.test.js`'s differential test.
 *
 * `reconcileFields` and `withWidgetFields`, copied verbatim (comments
 * trimmed) from `git show 42931c79:src/editor/adapters/pdf/fieldRegions.js`
 * - the code ARCH-24 step B (339784f3) replaced with the data-driven
 * `reconcile(sourceResults, { sourceOrder, kindPrecedence })`. Kept here,
 * never imported by production code, purely so a random differential test
 * can check the new fold-based `reconcile` against independent ground truth:
 * the two implementations must agree on every input, because the new one is
 * supposed to be the old one's behaviour turned into data, not a rewrite of
 * it. Do not "fix" a bug found here by editing this file - fix `fieldRegions.js`
 * and prove it against this unchanged oracle instead.
 *
 * `oldReconcile` below is the two-source pipeline exactly as
 * `detectFormFields.ts` ran it before step B: self-reconcile `ink` alone
 * (what `reconcileFields` always did), then fold `widgets` in through
 * `withWidgetFields`. `widgets` never contributed checkboxes even then
 * (`detectWidgetRegions` has none to give - see `detectFormFields.ts`'s
 * `widgetsSource`), so they pass through from `ink` unchanged, matching
 * `reconcile`'s current contract.
 */

const CLAIM_IOU = 0.3;
const CLAIM_CONTAINMENT = 0.6;

function overlap(a, b) {
  const iw = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const ih = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  const inter = iw * ih;
  if (inter <= 0) return false;
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - inter;
  const smaller = Math.min(areaA, areaB);
  return (union > 0 && inter / union >= CLAIM_IOU) || (smaller > 0 && inter / smaller >= CLAIM_CONTAINMENT);
}

function claimExtent(region) {
  return region.enclosure ?? region;
}

function withWidgetFields(reconciled, widgets) {
  const { combs, checkboxes, cells } = reconciled;
  const unclaimed = (region, found) => !found.some((other) => overlap(claimExtent(region), claimExtent(other)));
  const allCombs = [...combs, ...widgets.combs.filter((comb) => unclaimed(comb, [...combs, ...checkboxes]))];
  const inkCells = cells.filter((cell) => unclaimed(cell, allCombs));
  const taken = [...allCombs, ...checkboxes, ...inkCells];
  return { combs: allCombs, cells: [...inkCells, ...widgets.cells.filter((cell) => unclaimed(cell, taken))] };
}

function reconcileFields({ combs, checkboxes, cells }) {
  const claimed = new Set();
  const reconciledCombs = combs.map((comb) => {
    const enclosing = cells.filter((cell) => overlap(claimExtent(cell), claimExtent(comb)));
    enclosing.forEach((cell) => claimed.add(cell));
    if (comb.boxed || comb.writable || enclosing.length === 0) return comb;
    const area = (c) => claimExtent(c).width * claimExtent(c).height;
    const cell = enclosing.reduce((best, c) => (area(c) < area(best) ? c : best));
    const { left, top, width, height } = cell;
    return { ...comb, writable: { left, top, width, height } };
  });
  return {
    combs: reconciledCombs,
    cells: cells.filter((cell) => !claimed.has(cell)
      && !checkboxes.some((box) => overlap(claimExtent(cell), claimExtent(box)))),
  };
}

/**
 * @param {{ink: {combs: Array, checkboxes: Array, cells: Array}, widgets: {combs: Array, checkboxes: Array, cells: Array}}} sourceResults
 */
export function oldReconcile({ ink, widgets }) {
  const inkReconciled = reconcileFields(ink);
  const merged = withWidgetFields(
    { combs: inkReconciled.combs, checkboxes: ink.checkboxes, cells: inkReconciled.cells },
    { combs: widgets.combs ?? [], cells: widgets.cells ?? [] },
  );
  return { combs: merged.combs, checkboxes: ink.checkboxes, cells: merged.cells };
}
