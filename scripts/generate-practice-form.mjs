import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  PDFDocument, StandardFonts, rgb,
  rectangle, fillAndStroke, setFillingRgbColor, setStrokingRgbColor, setLineWidth,
} from '@cantoo/pdf-lib';
import {
  PAGE_SIZE, DOCUMENT_META, PALETTE, HEADER, SECTIONS, DECLARATION_TEXT, FOOTER, MARGIN_RULE,
  FIELDS, fieldLayout,
} from './practice-form-content.mjs';

/**
 * Renders the app's own practice form (SNG-10 v2) from `practice-form-content.mjs`'s layout, and
 * derives its scored-corpus ground truth from that same layout - one source, two outputs, so they
 * can never drift apart. `buildPracticeForm()` has no side effects; this module only writes files
 * when run directly (`node scripts/generate-practice-form.mjs`, or `npm run generate:practice-form`).
 *
 * v2 is flat: no `/AcroForm`, no widgets. Every box, comb cell and checkbox is drawn with the raw
 * `re` path-construction operator (`rectangle()` + `fillAndStroke()`), never `@cantoo/pdf-lib`'s
 * own `page.drawRectangle()` - that method builds every rectangle as an SVG path (`m`/`l`/`h`) and
 * never emits `re` at all (see `src/tools/sign/fields/corpus/README.md`, "pdf-lib never emits the
 * re operator"). `findCheckboxes` (`src/tools/sign/fields/formGrid.js`) reads only `ink.rects`,
 * which only a real `re` populates, so a path-drawn checkbox would be invisible to it - not a
 * hypothetical, the corpus's own "known gap" row pins exactly that limitation. Drawing every
 * rectangle with `re` is also simply what a real form producer's own rectangles look like on the
 * wire (the corpus's `paintedRect` spec kind exists for the same reason).
 *
 * Output is byte-deterministic: a fixed `CreationDate`/`ModificationDate` and `Producer`/`Creator`
 * are set explicitly after `PDFDocument.create()` (which otherwise stamps the wall-clock time), and
 * `pdf.save()` is called with `updateFieldAppearances: false` - the default `true` would call
 * `getOrCreateForm()` internally and silently add an empty `/AcroForm` to the catalog even though
 * this document never creates a field, which is exactly the thing v2 exists to not have.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PDF = path.resolve(here, '../public/images/redaction-guide/sample.pdf');
const OUTPUT_TRUTH = path.resolve(
  here, '../src/tools/sign/fields/corpus/scoring/ground-truth/practice-form-page1.json',
);

/** Fixed so two builds, run on different days, hash identically. */
const FIXED_DATE = new Date('2026-09-25T00:00:00Z');
const PRODUCER = 'PDkef practice form generator';

const colorOf = (key) => rgb(...PALETTE[key]);
const round4 = (value) => +value.toFixed(4);

/** A top-down rect (`y` measured from the page's own top edge) to pdf-lib's bottom-left convention. */
function bottomUp(pageHeight, rect) {
  return {
    x: rect.x, y: pageHeight - rect.y - rect.height, width: rect.width, height: rect.height,
  };
}

/**
 * Draws a filled and stroked rectangle with the raw `re` operator. See the module doc comment for
 * why this, and not `page.drawRectangle()`, is what every field box, comb cell and checkbox in this
 * form uses.
 */
function drawInkRect(page, {
  x, y, width, height, fillColor, borderColor, borderWidth = 0.8,
}) {
  page.pushOperators(
    setLineWidth(borderWidth),
    setStrokingRgbColor(...borderColor),
    setFillingRgbColor(...fillColor),
    rectangle(x, y, width, height),
    fillAndStroke(),
  );
}

/** Manual letter-spacing (pdf-lib's `drawText` has none): each glyph placed by its own measured
 * width plus a fixed tracking gap, centered on the page. */
function drawLetterSpacedCentered(page, text, {
  y, font, size, color, tracking, pageWidth,
}) {
  const chars = [...text];
  const widths = chars.map((char) => font.widthOfTextAtSize(char, size));
  const totalWidth = widths.reduce((sum, w) => sum + w, 0) + tracking * (chars.length - 1);
  let x = (pageWidth - totalWidth) / 2;
  chars.forEach((char, index) => {
    page.drawText(char, {
      x, y, size, font, color,
    });
    x += widths[index] + tracking;
  });
}

function drawHeader(page, pageHeight, font, bold) {
  page.drawText(HEADER.eyebrow, {
    x: 48, y: pageHeight - 40, size: 8, font, color: colorOf('muted'),
  });
  drawLetterSpacedCentered(page, HEADER.title, {
    y: pageHeight - 68, font: bold, size: 13, color: colorOf('ink'), tracking: 1.6, pageWidth: PAGE_SIZE[0],
  });
}

function drawSections(page, pageHeight, bold) {
  for (const section of SECTIONS) {
    page.drawText(section.heading, {
      x: 48, y: pageHeight - section.y, size: 11, font: bold, color: colorOf('ink'),
    });
  }
}

/** A field label, 9pt muted, its baseline 4pt above the field's own box (top-down). */
function drawFieldLabel(page, pageHeight, font, text, rect) {
  page.drawText(text, {
    x: rect.x, y: pageHeight - (rect.y - 4), size: 9, font, color: colorOf('muted'),
  });
}

/**
 * Comb cells are the one shape drawn with `page.drawRectangle()` (a path, not `re`) rather than
 * `drawInkRect`. `formGrid.js`'s comb reader calls `horizontalRules(ink)` with no
 * `includeRectSides` option, so a rect's own top/bottom never fold in as rules there (only
 * `formCells.js` opts into that) - a raw `re` cell would read as having no ruled top or bottom at
 * all, and `findRunsFromWalls`'s `requireCompactBoxes` pass drops any run that is not `boxed`. A
 * path-drawn rectangle has no such gap: each of its four sides is a real line segment, so it lands
 * directly in `ink.verticals`/`ink.horizontals` and reads as boxed either way. Measured, not assumed:
 * switching this one shape to `re` while proving out the rest of this form took comb recall from
 * 100% to 0%.
 */
function drawComb(page, box, cells) {
  const cellWidth = box.width / cells;
  for (let cell = 0; cell < cells; cell += 1) {
    page.drawRectangle({
      x: box.x + cell * cellWidth,
      y: box.y,
      width: cellWidth,
      height: box.height,
      color: colorOf('field'),
      borderColor: colorOf('teal'),
      borderWidth: 0.8,
    });
  }
}

function drawCheckbox(page, font, box, label) {
  drawInkRect(page, {
    ...box, fillColor: PALETTE.field, borderColor: PALETTE.teal, borderWidth: 0.8,
  });
  page.drawText(label, {
    x: box.x + box.width + 8, y: box.y + 2, size: 10.5, font, color: colorOf('ink'),
  });
}

/** A signature or date line: a single stroked rule, its caption directly below it, left-aligned
 * with the line's own start. No box - the rule and the caption are the whole field. */
function drawLineField(page, pageHeight, font, field) {
  const { line } = field;
  const y = pageHeight - line.y;
  page.drawLine({
    start: { x: line.x0, y }, end: { x: line.x1, y }, thickness: 0.8, color: colorOf('teal'),
  });
  page.drawText(field.label, {
    x: line.x0, y: y - 13, size: 9, font, color: colorOf('muted'),
  });
}

function drawFields(page, pageHeight, font) {
  for (const field of FIELDS) {
    if (field.line) {
      drawLineField(page, pageHeight, font, field);
      continue;
    }
    const box = bottomUp(pageHeight, field.rect);
    if (field.kind === 'checkbox') {
      drawCheckbox(page, font, box, field.label);
      continue;
    }
    drawFieldLabel(page, pageHeight, font, field.label, field.rect);
    if (field.kind === 'comb') drawComb(page, box, field.cells);
    else {
      drawInkRect(page, {
        ...box, fillColor: PALETTE.field, borderColor: PALETTE.teal, borderWidth: 0.8,
      });
    }
  }
}

function drawDeclaration(page, pageHeight, font) {
  const startY = pageHeight - 560;
  DECLARATION_TEXT.forEach((line, index) => {
    page.drawText(line, {
      x: 48, y: startY - index * 13, size: 9.5, font, color: colorOf('ink'),
    });
  });
}

/** See `MARGIN_RULE`'s own doc comment in practice-form-content.mjs for why this line exists. */
function drawMarginRule(page, pageHeight) {
  page.drawLine({
    start: { x: MARGIN_RULE.x, y: pageHeight - MARGIN_RULE.y0 },
    end: { x: MARGIN_RULE.x, y: pageHeight - MARGIN_RULE.y1 },
    thickness: 0.8,
    color: colorOf('rule'),
  });
}

function drawFooter(page, pageWidth, font) {
  const ruleY = 34;
  page.drawLine({
    start: { x: 48, y: ruleY }, end: { x: pageWidth - 48, y: ruleY }, thickness: 0.6, color: colorOf('rule'),
  });
  page.drawText(FOOTER.disclaimer, {
    x: 48, y: 19, size: 8.5, font, color: colorOf('muted'),
  });
  const pageNumberWidth = font.widthOfTextAtSize(FOOTER.pageNumber, 8.5);
  page.drawText(FOOTER.pageNumber, {
    x: pageWidth - 48 - pageNumberWidth, y: 19, size: 8.5, font, color: colorOf('muted'),
  });
}

/** Every field's own truth target, straight from the layout: the bounds are the field's own
 * defined rect (page fractions, top-down - the same convention `rect.y` already uses), exact by
 * construction rather than eyeballed. */
function buildTruth(pdfBytes, pageWidth, pageHeight) {
  const combCells = Object.fromEntries(FIELDS.filter((f) => f.kind === 'comb').map((f) => [f.id, f.cells]));
  const targets = fieldLayout().map(({
    id, kind, label, rect,
  }) => ({
    id,
    kind,
    bounds: {
      x: round4(rect.x / pageWidth),
      y: round4(rect.y / pageHeight),
      width: round4(rect.width / pageWidth),
      height: round4(rect.height / pageHeight),
    },
    label,
    notes: "from the form's own layout (scripts/practice-form-content.mjs): the field's own defined "
      + 'rect, exact by construction',
    ...(id in combCells ? { cells: combCells[id] } : {}),
  }));
  return {
    form: 'pdkef-practice-form',
    sha256: crypto.createHash('sha256').update(pdfBytes).digest('hex'),
    sourceUrl: 'in-repo: public/images/redaction-guide/sample.pdf',
    pageIndex: 0,
    pageSize: { width: pageWidth, height: pageHeight },
    render: null,
    notes: 'v2, a flat vector form: no AcroForm, no widgets. Every target comes straight from the '
      + "form's own layout (scripts/practice-form-content.mjs) rather than an eyeballed annotation - "
      + "the bounds are the field's own defined rect, exact by construction, and a line field's "
      + '(signature, the date beside it) is the writing area above its drawn line, per '
      + "lineWritableRect's own convention. Generated by scripts/generate-practice-form.mjs; "
      + 'regenerate rather than hand-edit.',
    targets,
  };
}

/** Builds the practice form and its ground truth. No side effects - see the module doc comment. */
export async function buildPracticeForm() {
  const [pageWidth, pageHeight] = PAGE_SIZE;
  const pdf = await PDFDocument.create();
  pdf.setTitle(DOCUMENT_META.title);
  pdf.setAuthor(DOCUMENT_META.author);
  pdf.setSubject(DOCUMENT_META.subject);
  pdf.setKeywords(DOCUMENT_META.keywords);
  pdf.setProducer(PRODUCER);
  pdf.setCreator(PRODUCER);
  pdf.setCreationDate(FIXED_DATE);
  pdf.setModificationDate(FIXED_DATE);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage(PAGE_SIZE);

  drawHeader(page, pageHeight, font, bold);
  drawSections(page, pageHeight, bold);
  drawFields(page, pageHeight, font);
  drawDeclaration(page, pageHeight, font);
  drawMarginRule(page, pageHeight);
  drawFooter(page, pageWidth, font);

  // updateFieldAppearances: false - see the module doc comment. This document never creates a
  // form field, and the default would silently give it an empty /AcroForm anyway.
  const pdfBytes = await pdf.save({ updateFieldAppearances: false });
  const truth = buildTruth(pdfBytes, pageWidth, pageHeight);
  return { pdfBytes, truth };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { pdfBytes, truth } = await buildPracticeForm();
  fs.writeFileSync(OUTPUT_PDF, pdfBytes);
  fs.writeFileSync(OUTPUT_TRUTH, `${JSON.stringify(truth, null, 1)}\n`);
  console.log(`Wrote ${OUTPUT_PDF}`);
  console.log(`Wrote ${OUTPUT_TRUTH}`);
}
