/**
 * Reconciles what each detection source found into one set of fields, from
 * declared data rather than hard-coded rules (ARCH-24 step B).
 *
 * Two facts about a page's own detected regions used to be code:
 *
 * 1. Between two regions of the same kind, whichever source is earlier in
 *    `SOURCE_ORDER` wins - `ink` beats `widgets` today.
 * 2. A comb beats a cell whichever source found it, and claims it. A cell is
 *    the weakest thing either side reports (`formCells.js` caps its own
 *    confidence below the comb detector's for exactly this reason), so a
 *    widget that says "nine boxes, `/MaxLen` 9" against an ink pass that only
 *    managed "some closed box here" is the better answer, and leaving both
 *    would put a plain text box and a nine-cell comb on one rectangle. A
 *    checkbox is never reclaimed this way - nothing in today's code ever
 *    removes one, from either source - so `KIND_PRECEDENCE`'s last entry
 *    (`cells`) is the only reclaimable kind; every other kind is "protected":
 *    it blocks a later region the way a cell never can, and it is never
 *    itself removed.
 *
 * `reconcile(sourceResults, { sourceOrder, kindPrecedence })` is the one
 * function both facts are data for. `detectFormFields.ts` calls it once per
 * page with that page's raw regions from every source, keyed by source name.
 * A new source does not need a name in `SOURCE_ORDER` to be folded in at
 * all: one absent from `sourceOrder` is appended after every name that is
 * present, in the order its result arrived, rather than dropped (ARCH-24
 * step C). Giving it a line in `SOURCE_ORDER` is still how its precedence
 * against `ink`/`widgets` is chosen on purpose; leaving it out only means
 * "runs last, wins no same-kind tie", not "invisible".
 *
 * A third thing is not a precedence rule and stays fixed, pure geometry:
 * `formCells.js`'s cell detector and `formGrid.js`'s comb detector each see
 * the whole page, so a printed cell that holds a comb is found twice, and an
 * *open* comb (teeth, no boxes) still knows something its own teeth do not -
 * how tall the field is. Form 101's identity number is 4-7pt ticks on the
 * rule of a 23pt cell, the same height as the name cells beside it, and text
 * placed on the ticks alone stood 5pt lower than its neighbours (live
 * report). `absorbWritable` gives an open, unboxed comb the bounds of the
 * tightest cell drawn around it as `writable`, from that comb's own source
 * only, before any cross-source reconciliation happens - a boxed comb (every
 * widget comb, and a printed run of closed boxes) never needs this, since its
 * own boxes are the field.
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

/** Whether `region` overlaps none of `claimedBy`, by the printed-box rule above. */
function unclaimed(region, claimedBy) {
  return !claimedBy.some((other) => overlap(claimExtent(region), claimExtent(other)));
}

/**
 * Gives every open, unclaimed-by-boxes comb in `combs` the bounds of the
 * tightest cell in `cells` that encloses it, as `writable` - the one piece of
 * `reconcileFields`'s old behaviour that is geometry, not precedence, and so
 * stays fixed rather than becoming data. A boxed comb, or one that already
 * carries `writable`, is returned unchanged. Never mutates its input.
 *
 * @param {Array} combs
 * @param {Array} cells
 * @returns {Array} `combs`, some with a new `writable` property
 */
function absorbWritable(combs, cells) {
  return combs.map((comb) => {
    if (comb.boxed || comb.writable) return comb;
    const enclosing = cells.filter((cell) => overlap(claimExtent(cell), claimExtent(comb)));
    if (enclosing.length === 0) return comb;
    // The tightest cell around the run, compared as printed boxes: a section
    // frame can overlap it too.
    const area = (c) => claimExtent(c).width * claimExtent(c).height;
    const cell = enclosing.reduce((best, c) => (area(c) < area(best) ? c : best));
    // A cell's own bounds are already the strip a person writes in, not the
    // ruled box around it (formCells.js, "What a cell candidate's bounds are").
    const { left, top, width, height } = cell;
    return { ...comb, writable: { left, top, width, height } };
  });
}

/**
 * The two sources today, earlier wins a tie. A new source may add its name
 * here to place it deliberately; one that does not is still folded in, last
 * (see `reconcile`'s module doc, ARCH-24 step C) - this list decides
 * precedence, not membership.
 */
export const SOURCE_ORDER = ['ink', 'widgets'];

/**
 * `combs` and `checkboxes` are "protected": once accepted they are never
 * removed, and each blocks a later region of any protected kind. `cells`,
 * last, is the only reclaimable kind - accepted only when nothing already
 * accepted (of any kind) overlaps it, and dropped the moment a protected kind
 * claims the same ground, whichever source found either one.
 */
export const KIND_PRECEDENCE = ['combs', 'checkboxes', 'cells'];

/**
 * Folds one source's regions into what earlier sources already contributed.
 * Called with an empty `accepted`, it resolves one source's own regions
 * against themselves - what `reconcileFields` used to do alone, for `ink`
 * only, before this existed.
 *
 * @param {Record<string, Array>} accepted one entry per kind in `kindPrecedence`
 * @param {Record<string, Array>} source one source's regions, same shape
 * @param {string[]} kindPrecedence
 * @returns {Record<string, Array>}
 */
function fold(accepted, source, kindPrecedence) {
  const next = { ...accepted };
  const protectedKinds = kindPrecedence.slice(0, -1);
  const reclaimableKind = kindPrecedence[kindPrecedence.length - 1];

  for (const kind of kindPrecedence) {
    const candidates = source[kind] ?? [];
    if (kind === reclaimableKind) {
      const blockedBy = kindPrecedence.flatMap((k) => next[k] ?? []);
      next[kind] = [...(next[kind] ?? []), ...candidates.filter((region) => unclaimed(region, blockedBy))];
    } else {
      const blockedBy = protectedKinds.flatMap((k) => next[k] ?? []);
      const acceptedHere = candidates.filter((region) => unclaimed(region, blockedBy));
      next[kind] = [...(next[kind] ?? []), ...acceptedHere];
      // A newly accepted protected-kind region reclaims any already-accepted
      // reclaimable-kind region it now overlaps - this is Rule 2 above,
      // whichever source (this fold or an earlier one) found the cell.
      if (acceptedHere.length > 0 && next[reclaimableKind]) {
        next[reclaimableKind] = next[reclaimableKind].filter((region) => unclaimed(region, acceptedHere));
      }
    }
  }
  return next;
}

/**
 * Reconciles every source's regions for one page into one set of fields.
 *
 * `sourceResults` is one entry per source name (`detectFormFields.ts`'s
 * `FieldSource.name`), each `{ combs, checkboxes, cells }`. Sources are
 * folded in `sourceOrder`, each source's own combs first absorbing a
 * `writable` strip from its own cells (see the module doc), then merged into
 * what earlier sources contributed by `kindPrecedence` (Rules 1 and 2 above).
 * A name in `sourceOrder` with no entry in `sourceResults` is skipped.
 *
 * A name in `sourceResults` that `sourceOrder` does not know - a new source
 * `detectFormFields` was handed without a line in `SOURCE_ORDER` - is folded
 * in too, appended after every named source, in the order its result appears
 * in `sourceResults` (`detectFormFields.ts` builds that object in the
 * caller's own `sources` array order, so this is deterministic, not
 * incidental). The alternative was silently dropping it, which is what this
 * function did before ARCH-24 step C: a caller composing a third source
 * through the public contract would have seen it vanish with no error and no
 * row of coverage lost, the same silent-failure shape ARCH-24's own "coupling
 * already cost us one outage" section warns about. Appending keeps that
 * caller's data instead, at the weakest possible precedence - it can still
 * lose a same-kind tie to `ink` or `widgets`, or a same-rectangle cell to a
 * later-processed protected kind - until its name earns a deliberate place in
 * `SOURCE_ORDER`. Pinned in `fieldRegions.test.js` ("reconcile, an unknown
 * source name") and demonstrated end to end through `detectFormFields` in
 * `corpus/thirdSourceContract.test.js`.
 *
 * @param {Record<string, {combs: Array, checkboxes: Array, cells: Array}>} sourceResults
 * @param {{sourceOrder?: string[], kindPrecedence?: string[]}} [options]
 * @returns {{combs: Array, checkboxes: Array, cells: Array}}
 */
export function reconcile(sourceResults, { sourceOrder = SOURCE_ORDER, kindPrecedence = KIND_PRECEDENCE } = {}) {
  const unknown = Object.keys(sourceResults).filter((name) => !sourceOrder.includes(name));
  const order = [...sourceOrder, ...unknown];
  let accepted = Object.fromEntries(kindPrecedence.map((kind) => [kind, []]));
  for (const name of order) {
    const source = sourceResults[name];
    if (!source) continue;
    const withWritable = { ...source, combs: absorbWritable(source.combs ?? [], source.cells ?? []) };
    accepted = fold(accepted, withWritable, kindPrecedence);
  }
  return accepted;
}
