/**
 * Reconciles one page's detected fields: the comb/checkbox detector
 * (`formGrid.js`) and the closed-cell detector (`formCells.js`) each see the
 * whole page, so a printed cell that holds a comb or a checkbox is found
 * twice. The comb detector's answer wins, but a cell drawn around an open
 * comb still knows something the teeth do not: how tall the field is. Form
 * 101's identity number is 4-7pt ticks on the rule of a 23pt cell, the same
 * height as the name cells beside it, and text placed on the ticks alone
 * stood 5pt lower than its neighbours (live report).
 */

/** A cell is the same field as a comb/checkbox when they overlap this much. */
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

/**
 * @template {{left: number, top: number, width: number, height: number, boxed?: boolean, writable?: object}} Comb
 * @template {{left: number, top: number, width: number, height: number, writable?: object}} Cell
 * @param {{combs: Comb[], checkboxes: object[], cells: Cell[]}} detected
 * @returns {{combs: Comb[], cells: Cell[]}} the combs, each open one carrying
 *   its enclosing cell's blank strip as `writable`; the cells nothing else
 *   already claims.
 */
/**
 * Folds a page's native `/Tx` widget regions (`detectWidgetRegions`) into what
 * the ink detectors reconciled, keeping whichever source found a field first.
 *
 * The two sources are not alternatives, because a form can be both at once.
 * Our own practice form paints nine guide boxes for its student-ID comb into
 * the page stream *and* lays a live comb widget over them, so the same field
 * arrives twice and only one of the two may reach the editor - a second hint
 * on the same strip is a second tap target for one box. Everything the ink
 * walk did not find, though, is a field a live form is simply telling us
 * about, and that is the whole of what this adds.
 *
 * Ink wins the ties: it is the source whose numbers the fixtures pin, and on
 * a flat-plus-widget hybrid its box is the one actually printed on the page.
 *
 * @param {{combs: Array, checkboxes: Array, cells: Array}} reconciled
 * @param {{combs: Array, cells: Array}} widgets
 * @returns {{combs: Array, cells: Array}}
 */
export function withWidgetFields(reconciled, widgets) {
  const { combs, checkboxes, cells } = reconciled;
  const unclaimed = (region, found) => !found.some((other) => overlap(region, other));
  const allCombs = [...combs, ...widgets.combs.filter((comb) => unclaimed(comb, [...combs, ...checkboxes]))];
  const taken = [...allCombs, ...checkboxes, ...cells];
  return { combs: allCombs, cells: [...cells, ...widgets.cells.filter((cell) => unclaimed(cell, taken))] };
}

export function reconcileFields({ combs, checkboxes, cells }) {
  const claimed = new Set();
  const reconciledCombs = combs.map((comb) => {
    const enclosing = cells.filter((cell) => overlap(cell, comb));
    enclosing.forEach((cell) => claimed.add(cell));
    if (comb.boxed || comb.writable || enclosing.length === 0) return comb;
    // The tightest cell around the run: a section frame can overlap it too.
    const cell = enclosing.reduce((best, c) => (c.width * c.height < best.width * best.height ? c : best));
    const { left, top, width, height } = cell.writable ?? cell;
    return { ...comb, writable: { left, top, width, height } };
  });
  return {
    combs: reconciledCombs,
    cells: cells.filter((cell) => !claimed.has(cell) && !checkboxes.some((box) => overlap(cell, box))),
  };
}
