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
 * What a cell occupies on the page for the purpose of "has something else
 * already claimed this?": its printed rectangle.
 *
 * A cell's own `bounds` are the strip a person writes in, which can be a
 * fraction of the box it was cut from (`formCells.js`, "What a cell candidate's
 * bounds are"); the box rides along as `enclosure`. Asking the claim question of
 * the strip asks the wrong thing - the health form rules a box per yes/no
 * question with the two printed captions on its top line and blank space under
 * them, so the radios it already detected sit *above* the carved strip and only
 * 16% of each one falls inside it. Measured on the MOBI-10 source PDFs: all 20
 * of those boxes contain their radio whole (containment 0.98-1.00 against the
 * enclosure, 0.16-0.17 against the strip), and every one was published as a
 * second field over a radio pair the checkbox detector had already reported.
 *
 * Asked of *both* sides of every claim test, not just the cell's. Only cells
 * carry an `enclosure` today, so the other side is its own extent either way;
 * comparing a printed box against a carved strip the moment a second source
 * grows one is the kind of asymmetry nothing would report.
 */
function claimExtent(region) {
  return region.enclosure ?? region;
}

/**
 * Folds a page's native `/Tx` widget regions (`detectWidgetRegions`) into what
 * the ink detectors reconciled, so that one field is one region however many
 * sources saw it.
 *
 * The two sources are not alternatives, because a form can be both at once.
 * Our own practice form paints nine guide boxes for its student-ID comb into
 * the page stream *and* lays a live comb widget over them, so that field
 * arrives twice and only one of the two may reach the editor - a second hint
 * on the same strip is a second tap target for one box. Everything the ink
 * walk did not find, though, is a field a live form is simply telling us
 * about, and that is the whole of what this adds.
 *
 * Two precedence rules, and they are the ones `reconcileFields` already
 * applies to the ink pass's own two detectors:
 *
 * 1. **Between equals, ink wins.** It is the source whose numbers the
 *    fixtures pin, and on a hybrid its box is the one actually printed.
 * 2. **A comb beats a cell, whichever source found it,** and claims it. A
 *    cell is the weakest thing either side reports - `formCells.js` caps its
 *    own confidence below the comb detector's for exactly this reason - so a
 *    widget that says "nine boxes, `/MaxLen` 9" against an ink pass that only
 *    managed "some closed box here" is the better answer, and leaving both
 *    would put a plain text box and a nine-cell comb on one rectangle.
 *
 * A widget comb is `boxed`, so it does not want the claimed cell's writing
 * strip the way an open comb does: its own boxes are the field.
 *
 * @param {{combs: Array, checkboxes: Array, cells: Array}} reconciled
 * @param {{combs: Array, cells: Array}} widgets
 * @returns {{combs: Array, cells: Array}}
 */
export function withWidgetFields(reconciled, widgets) {
  const { combs, checkboxes, cells } = reconciled;
  const unclaimed = (region, found) => !found.some((other) => overlap(claimExtent(region), claimExtent(other)));
  const allCombs = [...combs, ...widgets.combs.filter((comb) => unclaimed(comb, [...combs, ...checkboxes]))];
  // Rule 2. Against the ink pass's own combs this is a no-op - `reconcileFields`
  // has already dropped what they claimed - so it only ever removes a cell an
  // added widget comb now covers.
  const inkCells = cells.filter((cell) => unclaimed(cell, allCombs));
  const taken = [...allCombs, ...checkboxes, ...inkCells];
  return { combs: allCombs, cells: [...inkCells, ...widgets.cells.filter((cell) => unclaimed(cell, taken))] };
}

/**
 * @template {{left: number, top: number, width: number, height: number, boxed?: boolean, writable?: object}} Comb
 * @template {{left: number, top: number, width: number, height: number, enclosure?: object}} Cell
 * @param {{combs: Comb[], checkboxes: object[], cells: Cell[]}} detected
 * @returns {{combs: Comb[], cells: Cell[]}} the combs, each open one carrying
 *   its enclosing cell's blank strip as `writable`; the cells nothing else
 *   already claims.
 */
export function reconcileFields({ combs, checkboxes, cells }) {
  const claimed = new Set();
  const reconciledCombs = combs.map((comb) => {
    const enclosing = cells.filter((cell) => overlap(claimExtent(cell), claimExtent(comb)));
    enclosing.forEach((cell) => claimed.add(cell));
    if (comb.boxed || comb.writable || enclosing.length === 0) return comb;
    // The tightest cell around the run, compared as printed boxes: a section
    // frame can overlap it too.
    const area = (c) => claimExtent(c).width * claimExtent(c).height;
    const cell = enclosing.reduce((best, c) => (area(c) < area(best) ? c : best));
    // A cell's own bounds are already the strip a person writes in, not the
    // ruled box around it (formCells.js, "What a cell candidate's bounds are").
    const { left, top, width, height } = cell;
    return { ...comb, writable: { left, top, width, height } };
  });
  return {
    combs: reconciledCombs,
    cells: cells.filter((cell) => !claimed.has(cell)
      && !checkboxes.some((box) => overlap(claimExtent(cell), claimExtent(box)))),
  };
}
