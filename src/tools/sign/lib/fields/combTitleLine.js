import { tightestEnclosingCell } from './fieldRegions.js';

/**
 * Teeth at most this share of a text line's height are too short to be a line
 * of their own, so the line beside them says how tall the field is. Measured:
 * form 101's tax year, 8.0pt teeth beside a 14.0pt title (0.57); ภ.ง.ด.90's
 * amount boxes, 12.8pt beside a 14.0pt checkbox caption (0.91), already a
 * line tall and left alone.
 */
const MAX_TEETH_TO_LINE = 0.75;

/** Positions within this share of a cell pitch are the same edge. */
const EDGE_TOLERANCE_PITCH = 0.1;

/**
 * An open comb in a printed box whose caption is printed above it, inside the box (FORM-28):
 * `writable` runs from under the caption down to the comb's rule, the strip a person writes in.
 * Form 101's passport number: the box is ruled x 392.5-540.2, y 236.5-266.1, its caption
 * "מספר דרכון (למי שאין מספר ת.ז.)" sits in the top 8pt, and the teeth stand 5.2pt tall on the
 * floor. The cell detector never publishes that box - the address box's underline ends against
 * their shared wall, which it reads as a junction, and the caption is longer than a label - so the
 * comb has no cell to absorb. The box's top is the nearest rule above the comb that spans all of
 * it, no more than `maxHeight` above its floor; the caption is text between that rule and the
 * teeth, centred over the comb. No caption, no `writable`: a bare rule above says nothing. The
 * teeth have to be short against the strip, by the same `MAX_TEETH_TO_LINE`. Measured: passport
 * 5.2pt of 21.7 (0.24), the deduction-file number 5.6 of 17.9 (0.31).
 */
function captionAboveWritable(comb, { rules, titles, maxHeight }) {
  const pitch = comb.width / comb.cells;
  const tolerance = pitch * EDGE_TOLERANCE_PITCH;
  const right = comb.left + comb.width;
  const bottom = comb.top + comb.height;
  const spans = (rule) => rule.left <= comb.left + tolerance && rule.left + rule.width >= right - tolerance;
  const roof = rules
    .filter((rule) => spans(rule) && rule.top < comb.top - tolerance && bottom - rule.top <= maxHeight)
    .reduce((best, rule) => (best === null || rule.top > best.top ? rule : best), null);
  if (!roof) return null;
  const captions = titles.filter((run) => {
    const centre = run.left + run.width / 2;
    return centre > comb.left && centre < right
      && run.top >= roof.top - tolerance && run.top + run.height <= comb.top;
  });
  if (captions.length === 0) return null;
  const top = Math.max(...captions.map((run) => run.top + run.height));
  // Teeth already most of the strip's height are the box itself (ภ.ง.ด.90's 12.8pt amount boxes
  // under a caption 2.4pt above them, 0.84): nothing to add.
  if (comb.height > MAX_TEETH_TO_LINE * (bottom - top)) return null;
  return { left: comb.left, top, width: comb.width, height: bottom - top };
}

/**
 * An open comb that no printed cell encloses takes its field's height from the
 * text printed on its own line (FORM-27).
 *
 * An open comb's own bounds are its teeth - a few points tall, because they
 * mark the pitch, not the height anyone writes at. Inside a ruled cell the
 * cell says how tall the field is (`fieldRegions.js`'s `absorbWritable`). Form
 * 101's tax year has no cell: four teeth stand on a rule right beside the
 * section's own title, "שנת המס", and the year is written as part of that
 * title. So the title is what says how tall the field is: `writable` runs from
 * the top of that text down to the comb's rule, which is what the fill slot
 * frame outlines and what `placeCombOnRegion` lines the digits up in.
 *
 * "On its own line" is read strictly, so a caption in the row above or a
 * paragraph further along never lends its height: the run has to overlap the
 * teeth vertically, reach above them, and sit beside the comb - not over it -
 * within one cell pitch, and the teeth have to be short against it
 * (`MAX_TEETH_TO_LINE`). Measured on form 101 (points): teeth y 91.4-99.4,
 * pitch 16.2; the title y 81.5-95.5, 5.3 to the comb's right; the line above
 * it ends at y 82.1, clear of the teeth.
 *
 * A run lying on a detected checkbox is that checkbox's own glyph, not a
 * title: form 101 prints its boxes as an "o" in a symbol font, and the one
 * 2.7pt left of the spouse's passport comb (across that box's wall) would
 * otherwise have stretched the comb up 10pt to the glyph's top.
 *
 * Pure: page-percent regions and text runs in, new comb objects out, inputs
 * never mutated. A boxed comb (its own boxes are the field), one that already
 * carries `writable`, and one a cell encloses are returned unchanged.
 *
 * @param {Array} combs one source's combs, page percent
 * @param {{cells: Array, checkboxes: Array, textRuns: Array<{str: string, left: number, top: number, width: number, height: number}>,
 *   rules?: Array, maxHeight?: number}} page the same source's cells and lines, its checkboxes, the
 *   page's text runs, and its horizontal rules with the tallest box a caption may sit in, both page
 *   percent, for `captionAboveWritable`
 * @returns {Array} `combs`, some with a new `writable`
 */
export function titleLineWritable(combs, { cells, checkboxes, textRuns, rules = [], maxHeight = 0 }) {
  const intersects = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width
    && a.top < b.top + b.height && b.top < a.top + a.height;
  const titles = textRuns.filter((run) => run.str && run.str.trim()
    && !checkboxes.some((box) => intersects(run, box)));
  return combs.map((comb) => {
    if (comb.boxed || comb.writable || !(comb.cells > 0)) return comb;
    const pitch = comb.width / comb.cells;
    const right = comb.left + comb.width;
    const bottom = comb.top + comb.height;
    const onLine = titles.filter((run) => {
      const overlapsTeeth = run.top < bottom && run.top + run.height > comb.top;
      const gap = Math.max(run.left - right, comb.left - (run.left + run.width));
      return overlapsTeeth && run.top < comb.top && gap >= 0 && gap <= pitch
        && comb.height <= MAX_TEETH_TO_LINE * run.height;
    });
    if (onLine.length === 0) {
      const strip = captionAboveWritable(comb, { rules, titles, maxHeight });
      return strip && !tightestEnclosingCell(comb, cells) ? { ...comb, writable: strip } : comb;
    }
    // The cell test last: it scans every cell, and most combs have no title beside them.
    if (tightestEnclosingCell(comb, cells)) return comb;
    const top = Math.min(...onLine.map((run) => run.top));
    return { ...comb, writable: { left: comb.left, top, width: comb.width, height: bottom - top } };
  });
}
