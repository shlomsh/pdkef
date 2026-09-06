import { createPageGeometry, pdfPointToPagePercent } from '../../geometry/coords.ts';
import { MAX_COMB_CELLS } from '../../../constants/signGeometry.js';
import { collectPageInk, pageCropBox } from './pageInk.js';
import { collectCheckboxGlyphs, collectCheckboxWidgets } from './pdfObjects.js';

/**
 * Recovers fillable geometry from a flat form's own vector content.
 *
 * The forms people actually receive have no `/AcroForm` and no widget
 * annotations, but the boxes they are meant to write into are right there in
 * the page's drawing operators. This module reads the axis-aligned ink
 * `pageInk.js` collects and reports two kinds of candidate region:
 *
 *   - a **comb run**: five or more equal cells on one baseline at a regular
 *     pitch, which is what an identity-number, date or phone field looks like;
 *   - a **checkbox**: an isolated near-square in the checkbox size band.
 *
 * Regions come out in the page-percent model the editor already stores
 * elements in, routed through `geometry/coords.ts`. That is the one
 * page-coordinate transform in this repo (SIGN-05, ARCH-02) and a second copy
 * of it would be a defect, not a convenience.
 *
 * ## How a run is actually found, and why it is not just "equal gaps"
 *
 * The teeth of a comb are short vertical marks hanging from the field's rule.
 * They are the seed, but they are **not** the whole field: on form 101 the
 * nine-digit identity comb draws eight teeth and takes its two outer walls
 * from the enclosing table - the left wall as a tall stroked segment, the
 * right wall as the edge of a filled `re`. Seeding on teeth alone yields eight
 * cells for a nine-digit field, which is exactly the kind of off-by-one a
 * person then has to fix by dragging, i.e. the thing this exists to delete.
 * So a seeded run is extended by one pitch at each end when real ink stands
 * where the next wall would be. A cell has to be bounded on both sides by ink
 * that the page actually draws; nothing is invented.
 *
 * The converse matters just as much: a run has to *stop*. Form 101's two date
 * fields sit side by side on one baseline at one pitch with a table rule
 * between them, so a detector that only looks for equal gaps offers a single
 * sixteen-cell target covering two different dates. See `runsFromTeeth` for
 * why the wider gap between them is read as a boundary rather than as a tooth
 * the producer forgot to draw - MOBI-03 assumed the opposite, and the fixtures
 * say otherwise.
 */

/** Ink taller than this on a comb baseline is a table rule, not a tooth (PDF points). */
const TOOTH_MAX_HEIGHT = 14;
/** A closed digit-comb may use full-height cells instead of short teeth. */
const BOXED_COMB_MAX_HEIGHT = 28;
/** Ink shorter than this is a dot or an artefact rather than a deliberate mark. */
const TOOTH_MIN_HEIGHT = 1.5;
/** A rect narrower (or shorter) than this is a drawn rule, not a box. */
const THIN_INK = 1.5;
/** Teeth of one row hang from the same rule; this is how far their feet may differ. */
const BASELINE_TOLERANCE = 1.5;
/** How far a separator may sit from where the pitch predicts it (PDF points). */
const PITCH_TOLERANCE = 1;
/** Narrower than this is not a cell anyone could write a character into. */
const MIN_PITCH = 5;
/** Wider than this is a table column, not a comb cell. */
const MAX_PITCH = 40;
/** Four digits is the shortest numeric comb on the tax-year field in form 101. */
const MIN_CELLS = 4;
/** Checkbox size band, measured from the health declaration's 6.6pt and 7.6pt squares. */
const CHECKBOX_MIN_SIZE = 4;
const CHECKBOX_MAX_SIZE = 16;
/** How far from square a checkbox may be, as a share of its longer side. */
const CHECKBOX_SQUARENESS = 0.12;
/** Two boxes closer than this are the same drawn box (a stroke and a fill of one outline). */
const DUPLICATE_TOLERANCE = 0.5;
/** How much of a run's width must be ruled for that edge to count as closed. */
const CLOSED_EDGE_COVERAGE = 0.7;

/**
 * Every vertical edge the page draws, normalized to `{x, y0, y1}`.
 *
 * A thin rect is one edge down its middle - that is how a producer that has no
 * stroke draws a rule. A rect with real area contributes its two side walls,
 * which is where form 101's identity comb gets its right-hand boundary.
 */
function verticalEdges({ verticals, rects }) {
  const edges = verticals.map((edge) => ({ ...edge }));
  for (const rect of rects) {
    if (rect.width <= THIN_INK && rect.height > THIN_INK) {
      edges.push({ x: rect.x + rect.width / 2, y0: rect.y, y1: rect.y + rect.height });
    } else if (rect.width > THIN_INK && rect.height > THIN_INK) {
      edges.push({ x: rect.x, y0: rect.y, y1: rect.y + rect.height });
      edges.push({ x: rect.x + rect.width, y0: rect.y, y1: rect.y + rect.height });
    }
  }
  return edges;
}

/**
 * Every horizontal rule the page draws, normalized to `{y, x0, x1}`.
 *
 * A producer with no stroke draws a rule as a very short filled rect, exactly
 * as it draws a vertical one, so both sources are folded together here.
 */
function horizontalRules({ horizontals, rects }) {
  const rules = horizontals.map((rule) => ({ ...rule }));
  for (const rect of rects) {
    if (rect.height <= THIN_INK && rect.width > THIN_INK) {
      rules.push({ y: rect.y + rect.height / 2, x0: rect.x, x1: rect.x + rect.width });
    }
  }
  return rules;
}

/**
 * The share of `[left, right]` that horizontal ink covers at height `y`.
 *
 * Measured as coverage rather than as one spanning rule because a table drawn
 * cell by cell rules each cell separately: the health declaration's comb is
 * closed along its whole top, but by nine abutting segments rather than one.
 */
function ruledCoverage(rules, y, left, right) {
  const span = right - left;
  if (!(span > 0)) return 0;
  const parts = rules
    .filter((rule) => Math.abs(rule.y - y) <= BASELINE_TOLERANCE)
    .map((rule) => [Math.max(rule.x0, left), Math.min(rule.x1, right)])
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let cursor = left;
  for (const [from, to] of parts) {
    if (to <= cursor) continue;
    covered += to - Math.max(from, cursor);
    cursor = to;
  }
  return covered / span;
}

/** Groups teeth into rows by the baseline their feet share. */
function rowsByBaseline(teeth) {
  const rows = [];
  for (const tooth of [...teeth].sort((a, b) => a.y0 - b.y0)) {
    const open = rows[rows.length - 1];
    if (open && tooth.y0 - open.baseline <= BASELINE_TOLERANCE) {
      open.teeth.push(tooth);
      open.baseline = Math.max(open.baseline, tooth.y0);
    } else {
      rows.push({ baseline: tooth.y0, teeth: [tooth] });
    }
  }
  return rows;
}

/** Distinct x positions, nearest-first, with anything within a point treated as one mark. */
function distinctPositions(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const out = [];
  for (const value of sorted) {
    if (out.length === 0 || value - out[out.length - 1] > PITCH_TOLERANCE) out.push(value);
  }
  return out;
}

/** True when `edge` reaches the row's band, so it could be one of that row's walls. */
function touchesRow(edge, row) {
  return edge.y1 >= row.bottom - BASELINE_TOLERANCE && edge.y0 <= row.top + BASELINE_TOLERANCE;
}

/**
 * Splits one row's teeth into maximal sequences at a single pitch.
 *
 * A run ends wherever the gap stops matching, and the separator it ended on
 * starts the next one, so two fields ruled at the same pitch with a wall
 * between them come out as two runs rather than one double-width target.
 *
 * **A doubled gap is a boundary here, not a tooth someone forgot to draw**,
 * and that is a measurement rather than an assumption. MOBI-03 expected the
 * opposite, from a probe that grouped teeth by their exact top *and* bottom
 * and so dropped the taller group-separator ticks inside form 101's identity
 * combs - which is the whole of the "pitch conformance 8 of 11" it reports.
 * Grouping by the baseline the teeth actually hang from puts those ticks back
 * and every one of those rows resolves to a clean 11.3pt pitch with no wider
 * gap left in it. Of the doubled gaps that survive in either evidence form,
 * every one is a field boundary: a table rule between form 101's two date
 * fields, and the label cells (פקס = fax, נייד = mobile) sitting in the health
 * declaration's phone strip. Bridging them merges a fax number with a postal
 * code and invents a cell under the label. Splitting instead fails the safer
 * way round: a field that splits can still be widened by hand, whereas a
 * merged one hands the user a comb of the wrong pitch that looks deliberate.
 */
function runsFromTeeth(positions) {
  const runs = [];
  let start = 0;
  while (start < positions.length - 1) {
    const pitch = positions[start + 1] - positions[start];
    if (pitch < MIN_PITCH || pitch > MAX_PITCH) {
      start += 1;
      continue;
    }
    let end = start + 1;
    while (
      end < positions.length - 1
      && Math.abs(positions[end + 1] - positions[end] - pitch) <= PITCH_TOLERANCE
    ) end += 1;
    runs.push({ separators: positions.slice(start, end + 1), pitch });
    // The separator a run ended on is the next run's first wall.
    start = end;
  }
  return runs;
}

/** Grows a run by one pitch at each end, but only onto ink the page really draws. */
function extendToWalls(run, row, edges) {
  const { separators, pitch } = run;
  const wallAt = (predicted) => {
    const candidates = edges
      .filter((edge) => Math.abs(edge.x - predicted) <= PITCH_TOLERANCE && touchesRow(edge, row))
      .sort((a, b) => Math.abs(a.x - predicted) - Math.abs(b.x - predicted));
    return candidates[0]?.x;
  };

  const left = wallAt(separators[0] - pitch);
  const right = wallAt(separators[separators.length - 1] + pitch);
  return [
    ...(left === undefined ? [] : [left]),
    ...separators,
    ...(right === undefined ? [] : [right]),
  ];
}

/**
 * Comb runs on one page, in PDF user space.
 *
 * Exported separately from the page-percent API so the geometry can be
 * asserted in the units the form was measured in.
 */
function findRunsFromWalls(walls, rules, edges, { requireCompactBoxes = false } = {}) {
  const found = [];
  for (const grouped of rowsByBaseline(walls)) {
    if (grouped.teeth.length < MIN_CELLS - 1) continue;
    const row = {
      bottom: Math.min(...grouped.teeth.map((tooth) => tooth.y0)),
      top: Math.max(...grouped.teeth.map((tooth) => tooth.y1)),
    };
    const positions = distinctPositions(grouped.teeth.map((tooth) => tooth.x));

    for (const run of runsFromTeeth(positions)) {
      const separators = extendToWalls(run, row, edges);
      const cells = separators.length - 1;
      if (cells < MIN_CELLS || cells > MAX_COMB_CELLS) continue;
      const left = separators[0];
      const right = separators[separators.length - 1];
      const boxed = ruledCoverage(rules, row.top, left, right) >= CLOSED_EDGE_COVERAGE
        && ruledCoverage(rules, row.bottom, left, right) >= CLOSED_EDGE_COVERAGE;
      // Short walls are the usual teeth hanging from a writing rule. Taller
      // walls are only safe to treat as a comb when they close a compact row
      // of boxes: that admits real, full-height digit cells without turning a
      // tall table column into a text target.
      const rowHeight = row.top - row.bottom;
      if (requireCompactBoxes && (!boxed || rowHeight > run.pitch * 1.2)) continue;
      found.push({
        left,
        right,
        bottom: row.bottom,
        top: row.top,
        cells,
        pitch: (right - left) / cells,
        // Closed at the top as well as the bottom means the cells are boxes
        // rather than teeth hanging from a writing line, and text goes in the
        // middle of a box instead of sitting on a rule. The page says which:
        // form 101 has no horizontal ink at all along its runs' tops, the
        // health declaration has 96% of it. See placeCombOnRegion.
        boxed,
      });
    }
  }
  return found;
}

export function findCombRuns(ink) {
  const edges = verticalEdges(ink);
  const rules = horizontalRules(ink);
  const shortTeeth = edges.filter((edge) => {
    const height = edge.y1 - edge.y0;
    return height >= TOOTH_MIN_HEIGHT && height <= TOOTH_MAX_HEIGHT;
  });
  const tallBoxWalls = edges.filter((edge) => {
    const height = edge.y1 - edge.y0;
    return height > TOOTH_MAX_HEIGHT && height <= BOXED_COMB_MAX_HEIGHT;
  });

  // Keep the established short-tooth pass isolated: adding tall walls to it
  // changes its baselines and loses fields in dense government forms. The
  // second pass admits only compact, closed rows, which is the geometry of a
  // roomy digit comb rather than a table column.
  return [
    ...findRunsFromWalls(shortTeeth, rules, edges),
    ...findRunsFromWalls(tallBoxWalls, rules, edges, { requireCompactBoxes: true }),
  ];
}

/** Checkbox squares on one page, in PDF user space. */
export function findCheckboxes(ink) {
  const boxes = [];
  for (const rect of ink.rects) {
    const longest = Math.max(rect.width, rect.height);
    if (longest < CHECKBOX_MIN_SIZE || longest > CHECKBOX_MAX_SIZE) continue;
    if (Math.min(rect.width, rect.height) < CHECKBOX_MIN_SIZE) continue;
    if (Math.abs(rect.width - rect.height) > CHECKBOX_SQUARENESS * longest) continue;
    const duplicate = boxes.some(
      (box) => Math.abs(box.x - rect.x) <= DUPLICATE_TOLERANCE
        && Math.abs(box.y - rect.y) <= DUPLICATE_TOLERANCE,
    );
    if (!duplicate) boxes.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }
  return boxes;
}

function uniqueCheckboxes(boxes) {
  return boxes.filter((box, index) => !boxes.slice(0, index).some(
    (other) => Math.abs(other.x - box.x) <= DUPLICATE_TOLERANCE
      && Math.abs(other.y - box.y) <= DUPLICATE_TOLERANCE,
  ));
}

/**
 * A PDF-space box as the top-left-origin percentages the editor model stores.
 *
 * Both corners go through `pdfPointToPagePercent`, so a rotated page or a
 * translated crop box comes out right without this module knowing how.
 */
function toPagePercentBox(geometry, { x0, y0, x1, y1 }) {
  const a = pdfPointToPagePercent({ x: x0, y: y0 }, geometry);
  const b = pdfPointToPagePercent({ x: x1, y: y1 }, geometry);
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/**
 * Candidate fillable regions on one page, in the editor's page-percent model.
 *
 * @param {{verticals: Array, horizontals: Array, rects: Array}} ink
 * @param {import('../../geometry/coords.ts').PageGeometry} geometry
 * @param {number} pageIndex
 */
export function detectRegions(ink, geometry, pageIndex = 0, checkboxBoxes = findCheckboxes(ink)) {
  const combs = findCombRuns(ink).map((run) => ({
    kind: 'comb',
    pageIndex,
    cells: run.cells,
    pitchPoints: run.pitch,
    boxed: run.boxed,
    ...toPagePercentBox(geometry, {
      x0: run.left, y0: run.bottom, x1: run.right, y1: run.top,
    }),
  }));

  const checkboxes = uniqueCheckboxes(checkboxBoxes).map((box) => ({
    kind: 'checkbox',
    pageIndex,
    ...toPagePercentBox(geometry, {
      x0: box.x, y0: box.y, x1: box.x + box.width, y1: box.y + box.height,
    }),
  }));

  return { combs, checkboxes };
}

/**
 * Candidate fillable regions on a pdf-lib page. On-device and read-only: the
 * page is walked, never modified.
 *
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @param {number} pageIndex
 */
export function detectPageRegions(page, pageIndex = 0) {
  const geometry = createPageGeometry({
    cropBox: pageCropBox(page),
    rotation: page.getRotation().angle,
  });
  const ink = collectPageInk(page);
  return detectRegions(ink, geometry, pageIndex, [
    ...findCheckboxes(ink),
    ...collectCheckboxGlyphs(page),
    ...collectCheckboxWidgets(page),
  ]);
}
