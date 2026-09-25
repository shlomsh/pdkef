import { toPagePercentBox, pagePercentToPdfPoint } from '../../../editor/geometry/coords.ts';
import { verticalEdges, horizontalRules } from './inkEdges.js';
import { HEBREW_SIGNATURE, HEBREW_DATE } from './formCells.js';

/**
 * Open signature and date lines: a bare horizontal rule with a short caption naming it, and
 * nothing drawn around it. `formGrid.js`'s comb/checkbox reader wants teeth or a near-square box;
 * `formCells.js`'s closed-cell reader wants four ruled sides. Neither ever looks at a lone rule
 * with nothing around it, which is exactly what a signature or date line on a flat form is - the
 * shape SNG-10's practice form and every sketch in `docs/sign-next-gen.md` draw it as.
 *
 * ## The rule (precision over reach - SNG-11, `docs/sign-next-gen-guidelines.md` §1)
 *
 * A candidate is a horizontal rule (`inkEdges.js`'s `horizontalRules`, so a stroked line or a
 * thin filled rect - never a filled bar, which `horizontalRules`'s own `thinInk` already
 * excludes) that:
 *
 * 1. is at least `MIN_LINE_LENGTH` long;
 * 2. is not an edge of a closed cell, box, table or comb - no vertical ink touches the rule's own
 *    height anywhere from one end to the other (`closesIntoBoxOrComb`). A box corner sits at an
 *    end; a table divider or a comb tooth sits in the middle; the same test catches both, because
 *    both are "something vertical meets this rule where it stands," and an open line has nothing
 *    there at all;
 * 3. has an empty writing band above it - no ink, drawn or printed, in the `WRITING_BAND_HEIGHT`
 *    strip directly above the rule (`writingBandHasInk`). A second rule up there would close the
 *    first into a box; that is one instance of this same check, not a separate one;
 * 4. is named by a short caption, below it or to its left, that matches a signature or date
 *    keyword (`matchKeyword`) - English whole words, or the Hebrew constants `formCells.js`
 *    already owns (its construct-state comment applies here unchanged).
 *
 * Kind is `signature` or `date`, from whichever keyword the caption matched.
 *
 * ## Coordinates, and what the published region is
 *
 * Ink stays in PDF points (`pageInk.js`'s native unit, y up); text items and the output candidate
 * are the editor's page-percent model (0..100, top-left origin, y down), through the one shared
 * `geometry/coords.ts` transform every other detector here uses.
 *
 * The published region is **the writing area above the line**, not the line itself and not the
 * caption: `{ x: lineStart, width: lineLength, y: [lineY, lineY + WRITING_BAND_HEIGHT] }` in PDF
 * points - the same strip `writingBandHasInk` already proved is empty, carried through
 * `toPagePercentBox` exactly as `formCells.js` and `formGrid.js` carry their own bounds. That is
 * the convention the practice-form ground truth (SNG-10) uses for a signature/date line too: the
 * target is where a person writes, which on an open line is above it, not the rule or its caption.
 *
 * ## Why this never duplicates another detector's region
 *
 * A rule that closes into a box or a comb is excluded by construction (rule 2), so this source
 * cannot re-report what `formGrid.js` or `formCells.js` already explain - but `detectLineCandidates`
 * still takes `existingRegions` and drops any candidate whose bounds overlap one, as a second,
 * independent guarantee: reconciliation across sources happens in `fieldRegions.js`, but two
 * candidates from the *same* source's `cells` array are never checked against each other there
 * (`reconcile`'s own module doc), so a source that can emit two overlapping regions has to keep
 * itself honest.
 */

/** A rule shorter than this is a tick mark or a table divider, not a line to sign or date on. */
const MIN_LINE_LENGTH = 60;

/** How far past a rule's own height vertical ink may still sit and count as touching it - a box
 * corner, a table divider or a comb tooth, any of which disqualifies the rule as an open line. */
const Y_TOUCH_TOLERANCE = 1.5;
/** How far past either end that touching ink may sit and still count as meeting that end. */
const END_TOLERANCE = 3;

/** How tall the empty writing band above the line must stay clear, in PDF points - also the
 * published candidate's height. */
const WRITING_BAND_HEIGHT = 22;

/** A caption below the line: how far under it its own top edge may sit. */
const CAPTION_BELOW_GAP_MAX = 14;
/** A caption below the line: how far its own left edge may sit from the line's start, when it
 * does not mostly overlap the line's span instead. */
const CAPTION_BELOW_ALIGN_TOLERANCE = 6;
/** A caption to the line's left: how far its own right edge may sit from the line's start. */
const CAPTION_LEFT_GAP_MAX = 12;
/** A caption to the line's left: how far its own baseline may sit from the line's height. */
const CAPTION_LEFT_BASELINE_TOLERANCE = 6;

/** Longer than this is a sentence, not a caption naming a line (mirrors formCells.js's
 * MAX_LABEL_CHARS - kept as its own constant since a rule caption and a cell label are different
 * things that happen to share a length, not one value two files must stay in sync on). */
const MAX_CAPTION_CHARS = 25;

/** English keyword tables - whole words only, so "designed" never reads as a signature line. */
const SIGNATURE_EN_RE = /\b(signature|signed|sign here)\b/i;
const DATE_EN_RE = /\bdate\b/i;

/**
 * What a caption names, or `null` when it names neither - the one place English and Hebrew
 * keywords for both kinds are declared, so a second file never grows its own copy. Hebrew reads
 * `HEBREW_SIGNATURE`/`HEBREW_DATE` from `formCells.js` rather than redeclaring them: same root,
 * same reasoning (its own comment on construct state), one owner.
 *
 * @param {string} caption
 * @returns {'signature' | 'date' | null}
 */
function matchKeyword(caption) {
  const trimmed = caption.trim();
  if (!trimmed || trimmed.length > MAX_CAPTION_CHARS) return null;
  if (trimmed.includes(HEBREW_SIGNATURE)) return 'signature';
  if (trimmed.includes(HEBREW_DATE)) return 'date';
  if (SIGNATURE_EN_RE.test(trimmed)) return 'signature';
  if (DATE_EN_RE.test(trimmed)) return 'date';
  return null;
}

/** A page-percent text run -> PDF points, the same conversion `formCells.js`'s own
 * `textItemToPoints` does (not imported from there: it is three lines, and the two files each
 * keep their own rather than share an import for something this small). */
function textItemToPoints(item, geometry) {
  const topLeft = pagePercentToPdfPoint({ x: item.left, y: item.top }, geometry);
  const bottomRight = pagePercentToPdfPoint({ x: item.left + item.width, y: item.top + item.height }, geometry);
  return {
    str: item.str,
    x0: Math.min(topLeft.x, bottomRight.x),
    x1: Math.max(topLeft.x, bottomRight.x),
    y0: Math.min(topLeft.y, bottomRight.y),
    y1: Math.max(topLeft.y, bottomRight.y),
  };
}

/**
 * True when a vertical edge touches the rule's own height, anywhere from one end to the other -
 * see the module doc's rule 2. One test for a box corner at either end and for a divider or comb
 * tooth in the middle, because both are the same fact: something vertical meets this rule where
 * it stands.
 */
function closesIntoBoxOrComb(rule, edges) {
  return edges.some((edge) => {
    if (edge.y0 - Y_TOUCH_TOLERANCE > rule.y || edge.y1 + Y_TOUCH_TOLERANCE < rule.y) return false;
    return edge.x >= rule.x0 - END_TOLERANCE && edge.x <= rule.x1 + END_TOLERANCE;
  });
}

/**
 * True when the strip directly above the rule - the area it would publish as the writing area -
 * carries any ink or text at all: a second rule that would close it into a box, a vertical
 * reaching up into it, or a line of print that happens to sit there. See the module doc's rule 3.
 */
function writingBandHasInk(rule, edges, rules, textItemsPoints) {
  const top = rule.y + WRITING_BAND_HEIGHT;
  const overlapsX = (x0, x1) => x0 < rule.x1 && x1 > rule.x0;
  if (rules.some((other) => other.y > rule.y && other.y <= top && overlapsX(other.x0, other.x1))) return true;
  if (edges.some((edge) => edge.y1 > rule.y && edge.y0 < top && edge.x >= rule.x0 && edge.x <= rule.x1)) return true;
  if (textItemsPoints.some((item) => item.y1 > rule.y && item.y0 < top && overlapsX(item.x0, item.x1))) return true;
  return false;
}

/** The nearest text run sitting directly under the rule, starting near its left end or mostly
 * overlapping its span - a caption's usual position under a signature or date line. */
function captionBelow(rule, textItemsPoints) {
  let best = null;
  let bestGap = Infinity;
  for (const item of textItemsPoints) {
    if (!item.str.trim()) continue;
    const gap = rule.y - item.y1;
    if (gap < -1 || gap > CAPTION_BELOW_GAP_MAX) continue;
    const overlapWidth = Math.min(item.x1, rule.x1) - Math.max(item.x0, rule.x0);
    const itemWidth = item.x1 - item.x0;
    const startsNearLine = Math.abs(item.x0 - rule.x0) <= CAPTION_BELOW_ALIGN_TOLERANCE;
    const mostlyOverlaps = itemWidth > 0 && overlapWidth / itemWidth >= 0.5;
    if (!startsNearLine && !mostlyOverlaps) continue;
    if (gap < bestGap) { bestGap = gap; best = item; }
  }
  return best;
}

/** The nearest text run sitting directly left of the rule, on its own baseline - a caption like
 * "Date:" printed beside a short line rather than under it. */
function captionLeft(rule, textItemsPoints) {
  let best = null;
  let bestGap = Infinity;
  for (const item of textItemsPoints) {
    if (!item.str.trim()) continue;
    const gap = rule.x0 - item.x1;
    if (gap < -1 || gap > CAPTION_LEFT_GAP_MAX) continue;
    if (Math.abs(item.y0 - rule.y) > CAPTION_LEFT_BASELINE_TOLERANCE) continue;
    if (gap < bestGap) { bestGap = gap; best = item; }
  }
  return best;
}

/** Page-percent bounding-box overlap test - plain rectangle intersection, not `fieldRegions.js`'s
 * `claimExtent`/IoU rule (that answers "is this the same field", this only answers "did I already
 * publish something here"). */
function boundsOverlap(a, b) {
  return a.left < b.left + b.width && a.left + a.width > b.left
    && a.top < b.top + b.height && a.top + a.height > b.top;
}

/**
 * @typedef {import('./fieldTypes.ts').PercentBox} PercentBox
 * @typedef {import('./fieldTypes.ts').PageTextRun} PageTextRun
 */

/**
 * Open signature/date line candidates on one page.
 *
 * @param {{verticals: Array, horizontals: Array, rects: Array}} ink
 * @param {import('../../../editor/geometry/coords.ts').PageGeometry} geometry
 * @param {number} pageIndex
 * @param {PageTextRun[]} textItems page text, page-percent bounds
 * @param {PercentBox[]} [existingRegions] bounds another detector already published on this page
 *   (combs, checkboxes, closed cells) - see the module doc's "Why this never duplicates" section
 */
export function detectLineCandidates(ink, geometry, pageIndex, textItems, existingRegions = []) {
  const edges = verticalEdges(ink);
  const rules = horizontalRules(ink);
  const textItemsPoints = textItems.map((item) => textItemToPoints(item, geometry));

  const candidates = [];
  let index = 0;
  for (const rule of rules) {
    const length = rule.x1 - rule.x0;
    if (length < MIN_LINE_LENGTH) continue;
    if (closesIntoBoxOrComb(rule, edges)) continue;
    if (writingBandHasInk(rule, edges, rules, textItemsPoints)) continue;

    const below = captionBelow(rule, textItemsPoints);
    const kindBelow = below ? matchKeyword(below.str) : null;
    const left = kindBelow ? null : captionLeft(rule, textItemsPoints);
    const kindLeft = left ? matchKeyword(left.str) : null;
    const kind = kindBelow || kindLeft;
    if (!kind) continue;
    const caption = kindBelow ? below : left;

    const bounds = toPagePercentBox(geometry, {
      x0: rule.x0, y0: rule.y, x1: rule.x1, y1: rule.y + WRITING_BAND_HEIGHT,
    });
    if (existingRegions.some((region) => boundsOverlap(bounds, region))) continue;

    candidates.push({
      id: `form-lines-${String(index).padStart(4, '0')}`,
      pageIndex,
      ...bounds,
      kind,
      label: caption.str.trim(),
      required: 'unknown',
      // Below formCells.js's own ceiling (0.7): geometry alone (an open, unboxed rule) is weaker
      // evidence than a closed cell, and this source has no closure ratio to reward.
      confidence: 0.55,
      source: 'form-lines',
      notes: `length=${length.toFixed(1)} caption=${kindBelow ? 'below' : 'left'}`,
    });
    index += 1;
  }
  return candidates;
}
