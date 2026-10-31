// SIGN-44: the comments page(s) appended to an exported PDF. The text goes through the ordinary text
// pipeline as synthetic `text` elements (so Hebrew shaping and RTL come with it); `finish` adds what
// text elements cannot: the numbered circle, the clip of the passage from the page itself, the links.
import {
  PDFDocument, PDFName, PDFPage, StandardFonts, concatTransformationMatrix, popGraphicsState, pushGraphicsState, rgb,
} from '@cantoo/pdf-lib';
import type { PDFFont } from '@cantoo/pdf-lib';
import { applyAffineTransform, composeAffineTransforms, percentToPoints } from '#editor/geometry/coords.ts';
import type { AffineTransform, PageGeometry } from '#editor/geometry/coords.ts';
import type { EditorElement, HighlightElement, TextElement } from '#editor/model/editorModel.ts';
import { hexToRgbFractions } from '#editor/text/imageTint.js';
import { resolveTypography } from '#editor/text/fonts.js';
import { shapedWidth } from '#editor/text/shapeRun.ts';
import { detectTextDirection } from '#editor/text/textDirection.js';
import { BLEND_MULTIPLY } from '#lib/pdf/pdfLiterals.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { wrapLines } from './wrapLines.ts';

const CIRCLE_COLOR = '#0F766E';
const MARGIN = 56;
const CIRCLE_DIAMETER = 20;
const COLUMN_GAP = 12;
const TITLE_SIZE = 20;
const PAGE_LINE_SIZE = 9;
const COMMENT_SIZE = 11;
const LINE_HEIGHT_EM = 1.5;
const CLIP_PAD = 4;
const CLIP_MAX_HEIGHT = 110;
const CLIP_GAP = 6;
const ENTRY_GAP = 22;
const WRAP_SLACK = 0.96;
const DIVIDER_GRAY = 0.85;
const TITLE_COLOR = '#111111';
const PAGE_LINE_COLOR = '#555555';
const COMMENT_COLOR = '#222222';

type Direction = 'ltr' | 'rtl';
type LoadFont = (family: string, weight: string, style: string) => Promise<PDFFont | null>;

interface CommentsPageOptions {
  title: string;
  /** Template with a `{page}` token, the 1-based source page. */
  entryLabel: string;
  loadCustomFont: LoadFont;
  pageGeometry: (page: PDFPage) => PageGeometry;
}

interface CommentsPlan {
  /** Synthetic text elements for the appended page(s); signPdf serializes them like user text. */
  elements: TextElement[];
  /** Draws circles, passage clips and links; runs after the element loop. */
  finish: () => Promise<void>;
}

interface Entry {
  number: number;
  element: HighlightElement;
  commentsPage: PDFPage;
  circleY: number;
  clip: ClipPlan;
  linkRect: [number, number, number, number];
}

interface ClipPlan {
  /** Source user-space box to embed. */
  bbox: { left: number; bottom: number; right: number; top: number };
  /** Source user space -> comments page, for the embedded page (already translated to its own origin). */
  matrix: AffineTransform;
  /** Band rectangles on the comments page. */
  bands: { x: number; y: number; width: number; height: number }[];
  /** Where the passage starts in the source page's user space. */
  target: { x: number; y: number };
  width: number;
  height: number;
}

/** RTL layout when most commented highlights were swiped on right-to-left text. */
function commentsDirection(highlights: readonly HighlightElement[]): Direction {
  const rtl = highlights.filter((h) => h.direction === 'rtl').length;
  return rtl * 2 > highlights.length ? 'rtl' : 'ltr';
}

/** Geometry of one passage clip, in the source page's editor space (points, bottom-left origin) mapped onto the comments page. */
function planClip(element: HighlightElement, geometry: PageGeometry, destLeft: number, destBottom: number, columnWidth: number): ClipPlan {
  const boxW = percentToPoints(element.width, geometry.width);
  const boxH = percentToPoints(element.height, geometry.height);
  const boxLeft = percentToPoints(element.left, geometry.width);
  const boxTop = geometry.height - percentToPoints(element.top, geometry.height);
  const x0 = boxLeft - CLIP_PAD;
  const yb = boxTop - boxH - CLIP_PAD;
  const w = boxW + 2 * CLIP_PAD;
  const h = boxH + 2 * CLIP_PAD;
  const scale = Math.min(1, columnWidth / w, CLIP_MAX_HEIGHT / h);
  const corners = [[x0, yb], [x0 + w, yb], [x0, yb + h], [x0 + w, yb + h]]
    .map(([x, y]) => applyAffineTransform({ x, y }, geometry.editorToPdf));
  const bbox = {
    left: Math.min(...corners.map((c) => c.x)),
    right: Math.max(...corners.map((c) => c.x)),
    bottom: Math.min(...corners.map((c) => c.y)),
    top: Math.max(...corners.map((c) => c.y)),
  };
  // Editor space to comments page: one uniform scale and a shift.
  const editorToPage: AffineTransform = [scale, 0, 0, scale, destLeft - x0 * scale, destBottom - yb * scale];
  const matrix = composeAffineTransforms(
    composeAffineTransforms(editorToPage, geometry.pdfToEditor),
    [1, 0, 0, 1, bbox.left, bbox.bottom],
  );
  const bands = element.bands.map((band) => ({
    x: destLeft + (boxLeft + (band.left / 100) * boxW - x0) * scale,
    y: destBottom + (boxTop - ((band.top + band.height) / 100) * boxH - yb) * scale,
    width: (band.width / 100) * boxW * scale,
    height: (band.height / 100) * boxH * scale,
  }));
  return {
    bbox, matrix, bands, width: w * scale, height: h * scale,
    target: applyAffineTransform({ x: boxLeft, y: boxTop }, geometry.editorToPdf),
  };
}

/**
 * Appends the comments page(s) to `pdfDoc` and plans their content, or returns null when no highlight
 * carries a comment. Call before fonts load so the returned elements share that pass and the coverage check.
 */
export async function planCommentsPages(
  pdfDoc: PDFDocument,
  elements: readonly EditorElement[],
  numbers: ReadonlyMap<string, number>,
  options: CommentsPageOptions,
): Promise<CommentsPlan | null> {
  const sourcePageCount = pdfDoc.getPageCount();
  const commented = elements
    .filter((element): element is HighlightElement => element.type === 'highlight' && numbers.has(element.id) && element.pageIndex < sourcePageCount)
    .sort((a, b) => numbers.get(a.id)! - numbers.get(b.id)!);
  if (commented.length === 0) return null;

  const direction = commentsDirection(commented);
  const rtl = direction === 'rtl';
  const lastGeometry = options.pageGeometry(pdfDoc.getPage(sourcePageCount - 1));
  const pageW = lastGeometry.width;
  const pageH = lastGeometry.height;
  const columnWidth = pageW - 2 * MARGIN - CIRCLE_DIAMETER - COLUMN_GAP;
  // The column's start edge: the left edge for LTR, the right edge for RTL.
  const columnEdge = rtl ? pageW - MARGIN - CIRCLE_DIAMETER - COLUMN_GAP : MARGIN + CIRCLE_DIAMETER + COLUMN_GAP;
  const columnLeft = rtl ? MARGIN : columnEdge;
  const circleX = rtl ? pageW - MARGIN - CIRCLE_DIAMETER / 2 : MARGIN + CIRCLE_DIAMETER / 2;

  const textElements: TextElement[] = [];
  const entries: Entry[] = [];
  const dividers: { page: PDFPage; y: number }[] = [];
  let pageIndex = -1;
  let page: PDFPage | null = null;
  let y = 0;
  const newPage = () => {
    page = pdfDoc.addPage([pageW, pageH]);
    pageIndex = pdfDoc.getPageCount() - 1;
    y = MARGIN;
  };

  /** Measures with the font a text resolves to; falls back to a rough width when the font is unavailable. */
  const measurerFor = async (text: string, size: number, weight: 'normal' | 'bold') => {
    const typography = resolveTypography('Arimo', text, weight, 'normal', size);
    const font = await options.loadCustomFont(typography.family, typography.weight, typography.style);
    return (line: string): number => {
      if (!font) return line.length * size * 0.55;
      return shapedWidth(font, line, size, detectTextDirection(line) === 'rtl' ? 'rtl' : 'ltr')
        ?? font.widthOfTextAtSize(line, size);
    };
  };

  /** One line as a text element on a start edge: a free box anchors by its own direction, so a line reading against the layout is shifted by its width. */
  const pushLine = async (text: string, size: number, weight: 'normal' | 'bold', color: string, top: number, edge: number) => {
    if (!text) return;
    const lineWidth = (await measurerFor(text, size, weight))(text);
    const lineRtl = detectTextDirection(text) === 'rtl' || (detectTextDirection(text) === null && rtl);
    let left = edge;
    if (rtl && !lineRtl) left = edge - lineWidth;
    if (!rtl && lineRtl) left = edge + lineWidth;
    textElements.push({
      id: `comments-text-${textElements.length}`,
      type: 'text',
      pageIndex,
      left: (left / pageW) * 100,
      top: (top / pageH) * 100,
      text,
      fontSize: size,
      fontFamily: 'Arimo',
      fontWeight: weight,
      color,
      textDirection: direction,
    });
  };

  newPage();
  await pushLine(options.title, TITLE_SIZE, 'bold', TITLE_COLOR, y, rtl ? pageW - MARGIN : MARGIN);
  y += TITLE_SIZE * LINE_HEIGHT_EM + 14;

  const commentLineHeight = COMMENT_SIZE * LINE_HEIGHT_EM;
  const pageLineHeight = PAGE_LINE_SIZE * LINE_HEIGHT_EM;
  for (const element of commented) {
    const number = numbers.get(element.id)!;
    const sourceGeometry = options.pageGeometry(pdfDoc.getPage(element.pageIndex));
    const comment = element.comment!.trim();
    const measure = await measurerFor(comment, COMMENT_SIZE, 'normal');
    const lines = wrapLines(comment, columnWidth * WRAP_SLACK, measure);
    const probeClip = planClip(element, sourceGeometry, 0, 0, columnWidth);
    const headerHeight = pageLineHeight + CLIP_GAP + probeClip.height + CLIP_GAP;
    if (y + headerHeight + commentLineHeight > pageH - MARGIN) newPage();

    const entryTop = y;
    const clipTop = entryTop + pageLineHeight + CLIP_GAP;
    const clipLeft = rtl ? columnEdge - probeClip.width : columnEdge;
    const clip = planClip(element, sourceGeometry, clipLeft, pageH - clipTop - probeClip.height, columnWidth);
    await pushLine(
      formatMessage(options.entryLabel, { page: element.pageIndex + 1 }),
      PAGE_LINE_SIZE, 'normal', PAGE_LINE_COLOR, entryTop + 2, columnEdge,
    );
    entries.push({
      number, element, commentsPage: page!, circleY: pageH - (entryTop + CIRCLE_DIAMETER / 2), clip,
      linkRect: [0, 0, 0, 0],
    });
    const entry = entries[entries.length - 1];
    y = clipTop + clip.height + CLIP_GAP;
    let lastY = y;
    for (const line of lines) {
      if (y + commentLineHeight > pageH - MARGIN) newPage();
      await pushLine(line, COMMENT_SIZE, 'normal', COMMENT_COLOR, y, columnEdge);
      y += commentLineHeight;
      if (page === entry.commentsPage) lastY = y;
    }
    entry.linkRect = [MARGIN, pageH - lastY, pageW - MARGIN, pageH - entryTop];
    dividers.push({ page: page!, y: y + ENTRY_GAP / 2 });
    y += ENTRY_GAP;
  }

  const finish = async () => {
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const circle = hexToRgbFractions(CIRCLE_COLOR);
    for (const { page: dividerPage, y: dividerY } of dividers.slice(0, -1)) {
      if (dividerY > pageH - MARGIN) continue;
      dividerPage.drawLine({
        start: { x: columnLeft, y: pageH - dividerY }, end: { x: columnLeft + columnWidth, y: pageH - dividerY },
        thickness: 0.5, color: rgb(DIVIDER_GRAY, DIVIDER_GRAY, DIVIDER_GRAY),
      });
    }
    for (const entry of entries) {
      const { commentsPage, clip, element } = entry;
      commentsPage.drawCircle({ x: circleX, y: entry.circleY, size: CIRCLE_DIAMETER / 2, color: rgb(circle.r, circle.g, circle.b) });
      const label = String(entry.number);
      const labelSize = label.length > 2 ? 7 : 10;
      commentsPage.drawText(label, {
        x: circleX - bold.widthOfTextAtSize(label, labelSize) / 2,
        y: entry.circleY - labelSize * 0.35,
        size: labelSize, font: bold, color: rgb(1, 1, 1),
      });

      // The highlight is an annotation, not page content, so the clip gets its bands painted beneath
      // the page and the page multiplied over them.
      const { r, g, b } = hexToRgbFractions(element.color);
      for (const band of clip.bands) commentsPage.drawRectangle({ ...band, color: rgb(r, g, b) });
      const sourcePage = pdfDoc.getPage(element.pageIndex);
      const embedded = await pdfDoc.embedPage(sourcePage, clip.bbox);
      commentsPage.pushOperators(pushGraphicsState(), concatTransformationMatrix(...clip.matrix));
      commentsPage.drawPage(embedded, { x: 0, y: 0, blendMode: BLEND_MULTIPLY });
      commentsPage.pushOperators(popGraphicsState());

      const link = pdfDoc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: entry.linkRect,
        Border: [0, 0, 0],
        Dest: [sourcePage.ref, PDFName.of('XYZ'), clip.target.x, clip.target.y, null],
      });
      commentsPage.node.addAnnot(pdfDoc.context.register(link));
    }
  };

  return { elements: textElements, finish };
}
