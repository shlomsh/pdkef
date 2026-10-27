// @ts-check
/**
 * Reconciles what each detection source found into one set of fields, from
 * declared data (ARCH-24): the earlier source in `SOURCE_ORDER` wins a
 * same-kind tie, and a comb beats a cell whichever source found it. Only the
 * last kind in `KIND_PRECEDENCE` is reclaimable; the others block later regions
 * and are never removed. See docs/sign-form-fields.md.
 */

/** A cell is the same field as a comb/checkbox when they overlap this much. */
const CLAIM_IOU = 0.3;
const CLAIM_CONTAINMENT = 0.6;

/**
 * @typedef {import('./fieldTypes.ts').PercentBox} PercentBox
 * @typedef {import('./fieldTypes.ts').FieldRegion} FieldRegion
 * @typedef {import('./fieldTypes.ts').CombRegion} CombRegion
 * @typedef {import('./fieldTypes.ts').DetectedCell} DetectedCell
 */

/**
 * @param {PercentBox} a
 * @param {PercentBox} b
 */
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
 * What a region occupies for the claim question: its printed rectangle. A
 * cell's `bounds` are only the writing strip, and radios sit outside it.
 */
/** @param {FieldRegion} region */
function claimExtent(region) {
  return region.enclosure ?? region;
}

/**
 * Whether `region` overlaps none of `claimedBy`, by the printed-box rule.
 *
 * @param {FieldRegion} region
 * @param {FieldRegion[]} claimedBy
 */
function unclaimed(region, claimedBy) {
  return !claimedBy.some((other) => overlap(claimExtent(region), claimExtent(other)));
}

/**
 * The tightest cell around `region`, by printed box, or `null`. Exported so
 * `combTitleLine.js` applies the rule `absorbWritable` uses.
 *
 * @template {FieldRegion} T
 * @param {FieldRegion} region
 * @param {T[]} cells
 * @returns {T|null}
 */
export function tightestEnclosingCell(region, cells) {
  const enclosing = cells.filter((cell) => overlap(claimExtent(cell), claimExtent(region)));
  if (enclosing.length === 0) return null;
  /** @param {T} c */
  const area = (c) => claimExtent(c).width * claimExtent(c).height;
  return enclosing.reduce((best, c) => (area(c) < area(best) ? c : best));
}

/**
 * Gives every open, unboxed comb the bounds of the cell enclosing it as
 * `writable`: fixed geometry, not data (an open comb cannot know how tall its
 * field is). Never mutates its input.
 *
 * @param {CombRegion[]} combs
 * @param {FieldRegion[]} cells
 * @returns {CombRegion[]} `combs`, some with a new `writable` property
 */
function absorbWritable(combs, cells) {
  return combs.map((comb) => {
    if (comb.boxed || comb.writable) return comb;
    const cell = tightestEnclosingCell(comb, cells);
    if (!cell) return comb;
    // The cell's bounds are already the writing strip, not the ruled box.
    const { left, top, width, height } = cell;
    return { ...comb, writable: { left, top, width, height } };
  });
}

/** The three sources, earlier wins a tie. This decides precedence, not membership. */
// Frozen so no caller can mutate precedence for every other caller.
export const SOURCE_ORDER = Object.freeze(['ink', 'widgets', 'leaders']);

/** Protected kinds first, the one reclaimable kind (`cells`) last. */
export const KIND_PRECEDENCE = Object.freeze(['combs', 'checkboxes', 'cells']);

/**
 * Folds one source's regions into what earlier sources contributed.
 *
 * @param {Record<string, FieldRegion[]>} accepted one entry per kind in `kindPrecedence`
 * @param {Record<string, FieldRegion[]>} source one source's regions, same shape
 * @param {readonly string[]} kindPrecedence
 * @returns {Record<string, FieldRegion[]>}
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
      // Blocked only by what earlier sources accepted (`accepted`), never by
      // `next`: within one source, combs and checkboxes do not block each other.
      const blockedBy = protectedKinds.flatMap((k) => accepted[k] ?? []);
      const acceptedHere = candidates.filter((region) => unclaimed(region, blockedBy));
      next[kind] = [...(next[kind] ?? []), ...acceptedHere];
      // A newly accepted protected region reclaims any accepted cell it overlaps (rule 2).
      if (acceptedHere.length > 0 && next[reclaimableKind]) {
        next[reclaimableKind] = next[reclaimableKind].filter((region) => unclaimed(region, acceptedHere));
      }
    }
  }
  return next;
}

/**
 * Reconciles every source's regions for one page. A result name `sourceOrder`
 * does not know is appended last, never dropped (`fieldRegions.test.js`).
 *
 * @template {FieldRegion} Cell the cell type the sources report; it comes back unchanged
 * @param {Record<string, {combs: CombRegion[], checkboxes: FieldRegion[], cells: Cell[]}>} sourceResults
 * @param {{sourceOrder?: readonly string[], kindPrecedence?: readonly string[]}} [options]
 * @returns {{combs: CombRegion[], checkboxes: FieldRegion[], cells: Cell[]}}
 */
export function reconcile(sourceResults, { sourceOrder = SOURCE_ORDER, kindPrecedence = KIND_PRECEDENCE } = {}) {
  const unknown = Object.keys(sourceResults).filter((name) => !sourceOrder.includes(name));
  const order = [...sourceOrder, ...unknown];
  /** @type {Record<string, FieldRegion[]>} */
  let accepted = Object.fromEntries(kindPrecedence.map((kind) => [kind, []]));
  for (const name of order) {
    const source = sourceResults[name];
    if (!source) continue;
    const withWritable = { ...source, combs: absorbWritable(source.combs ?? [], source.cells ?? []) };
    accepted = fold(accepted, withWritable, kindPrecedence);
  }
  return /** @type {{combs: CombRegion[], checkboxes: FieldRegion[], cells: Cell[]}} */ (accepted);
}
