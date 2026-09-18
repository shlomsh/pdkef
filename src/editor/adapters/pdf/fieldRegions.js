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
