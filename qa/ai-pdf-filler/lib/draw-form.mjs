/**
 * forms.mjs layout -> flat (vector) PDF bytes. Writes nothing; reads fonts via text.mjs. Rects from the layout are the
 * contract and are drawn exactly; only label and heading text is positioned here.
 * Everything is a printed-form look: near-black and grey ink, no AcroForm, widgets or annotations.
 */
import {
  grayscale, pushGraphicsState, popGraphicsState, setStrokingColor, setLineWidth, rectangle, stroke,
} from '@cantoo/pdf-lib';
import { PAGE, SYNTHETIC_BANNER } from '../forms.mjs';
import { createDocument, addFixturePage, saveDocument } from './document.mjs';
import { embedFonts, drawLine } from './text.mjs';
import { toPdfRect } from './geometry.mjs';

const MARGIN = 48;
/** Text must stay inside the page margins, or drawing throws rather than clipping silently. */
const MIN_INK_X = 24;
const MAX_INK_X = PAGE.width - 24;

const INK = grayscale(0.1);
const BOX_INK = grayscale(0.25);
const MUTED_INK = grayscale(0.42);
const BANNER_INK = grayscale(0.5);

const BOX_LINE_WIDTH = 0.8;
const COMB_DIVIDER_WIDTH = 0.6;
const OFFICE_BOX_LINE_WIDTH = 0.6;

const SIZE = { title: 16, subtitle: 11, banner: 8, heading: 11, body: 9.5, label: 9, footer: 8 };
const Y = { banner: 30, title: 62, subtitle: 82, footer: 818 };
const BODY_LEADING = 13;
const LABEL_GAP_ABOVE_RECT = 4;
const SIGNATURE_LABEL_DROP = 12;
const CHECKBOX_LABEL_GAP = 6;
/** Baseline sits this far (in em) below the middle of a box, so text looks vertically centred on it. */
const CENTRE_BASELINE_EM = 0.36;
const OFFICE_HEADING_INSET = { x: 8, baseline: 13 };

export async function drawFlatForm(form) {
  const doc = await createDocument(`Synthetic test form (${form.id})`);
  const fonts = await embedFonts(doc, form.font);
  const page = addFixturePage(doc);
  const rtl = form.direction === 'rtl';
  const startSide = rtl ? 'right' : 'left';
  const marginStartX = rtl ? PAGE.width - MARGIN : MARGIN;

  /** Draws text with `y` given as a baseline in top-left page points. */
  const text = (line, { y, x, size, weight = 'regular', color = INK, align }) => {
    const extent = drawLine(page, fonts[weight], line, {
      x, baseline: PAGE.height - y, size, color, direction: form.direction, align,
    });
    if (extent.left < MIN_INK_X || extent.right > MAX_INK_X) {
      throw new Error(`"${line}" spans x ${extent.left.toFixed(1)}..${extent.right.toFixed(1)}, outside the page margins`);
    }
  };
  const centred = (line, y, size, weight, color) => text(line, { y, x: PAGE.width / 2, size, weight, color, align: 'center' });
  const atStart = (line, { y, x = marginStartX, size, weight, color }) => text(line, { y, x, size, weight, color, align: startSide });
  /** Anchor for text hugging a rect's start edge (left edge in LTR, right edge in RTL). */
  const rectStartX = (rect) => (rtl ? rect.x + rect.width : rect.x);

  centred(SYNTHETIC_BANNER[form.id], Y.banner, SIZE.banner, 'regular', BANNER_INK);
  centred(form.title, Y.title, SIZE.title, 'bold');
  centred(form.subtitle, Y.subtitle, SIZE.subtitle, 'regular');
  for (const section of form.sections) atStart(section.heading, { y: section.y, size: SIZE.heading, weight: 'bold' });
  for (const paragraph of form.paragraphs) {
    paragraph.lines.forEach((line, i) => atStart(line, { y: paragraph.y + i * BODY_LEADING, size: SIZE.body }));
  }

  const strokeRect = (rect, color, width) => {
    const { x, y, width: w, height: h } = toPdfRect(rect);
    page.pushOperators(pushGraphicsState(), setStrokingColor(color), setLineWidth(width), rectangle(x, y, w, h), stroke(), popGraphicsState());
  };
  const strokeLine = (from, to, color, width) => page.drawLine({
    start: { x: from.x, y: PAGE.height - from.y }, end: { x: to.x, y: PAGE.height - to.y }, color, thickness: width,
  });

  strokeRect(form.officeBox, MUTED_INK, OFFICE_BOX_LINE_WIDTH);
  const officeHeadingX = rtl ? form.officeBox.x + form.officeBox.width - OFFICE_HEADING_INSET.x : form.officeBox.x + OFFICE_HEADING_INSET.x;
  atStart(form.officeBox.heading, { x: officeHeadingX, y: form.officeBox.y + OFFICE_HEADING_INSET.baseline, size: SIZE.label, color: MUTED_INK });

  const seenGroups = new Set();
  for (const field of form.fields) {
    const { rect } = field;
    if (field.group && !seenGroups.has(field.group)) {
      seenGroups.add(field.group);
      const group = form.groups[field.group];
      atStart(group.label, { x: rectStartX(rect), y: group.y, size: SIZE.label });
    }
    if (field.kind === 'checkbox') {
      strokeRect(rect, BOX_INK, BOX_LINE_WIDTH);
      const beyondBox = rtl ? { x: rect.x - CHECKBOX_LABEL_GAP, align: 'right' } : { x: rect.x + rect.width + CHECKBOX_LABEL_GAP, align: 'left' };
      text(field.label, { ...beyondBox, y: rect.y + rect.height / 2 + SIZE.label * CENTRE_BASELINE_EM, size: SIZE.label });
    } else if (field.line) {
      const lineY = rect.y + rect.height;
      strokeLine({ x: rect.x, y: lineY }, { x: rect.x + rect.width, y: lineY }, BOX_INK, BOX_LINE_WIDTH);
      atStart(field.label, { x: rectStartX(rect), y: lineY + SIGNATURE_LABEL_DROP, size: SIZE.label });
    } else {
      strokeRect(rect, BOX_INK, BOX_LINE_WIDTH);
      for (let cell = 1; field.kind === 'comb' && cell < field.cells; cell += 1) {
        const dividerX = rect.x + (rect.width * cell) / field.cells;
        strokeLine({ x: dividerX, y: rect.y }, { x: dividerX, y: rect.y + rect.height }, BOX_INK, COMB_DIVIDER_WIDTH);
      }
      atStart(field.label, { x: rectStartX(rect), y: rect.y - LABEL_GAP_ABOVE_RECT, size: SIZE.label });
    }
  }

  centred(form.footer, Y.footer, SIZE.footer, 'regular', MUTED_INK);
  return saveDocument(doc);
}
