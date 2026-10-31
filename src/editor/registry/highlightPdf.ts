import { PDFHexString, PDFName, PDFString } from '@cantoo/pdf-lib';
import type { PDFDocument, PDFRef } from '@cantoo/pdf-lib';
import type { HighlightElement } from '../model/editorModel.ts';
import type { SerializeContext } from './types.ts';
import { DEFAULT_HIGHLIGHT_COLOR } from '../model/highlightColors.ts';
import { hexToRgbFractions } from '../text/imageTint.js';
import { applyAffineTransform, percentToPoints } from '../geometry/coords.ts';
import type { AffineTransform } from '../geometry/coords.ts';

/** SIGN-44: the comment-number badge, a filled circle in the app's teal. */
export const COMMENT_BADGE_COLOR = '#0F766E';
const BADGE_SIZE = 11;
const BADGE_GAP = 1;
const POPUP_WIDTH = 160;
const POPUP_HEIGHT = 80;
const IDENTITY: AffineTransform = [1, 0, 0, 1, 0, 0];
const KAPPA = 0.5523;

type Point = [number, number];
type Bounds = [number, number, number, number];

const fixed = (n: number) => String(Math.round(n * 1000) / 1000);
const boundsOf = (points: Point[]): Bounds => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

/** `D:YYYYMMDDHHmmSSZ`, the PDF date string for "now" in UTC. */
function pdfDate(date = new Date()): PDFString {
  const pad = (n: number) => String(n).padStart(2, '0');
  const text = `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
    + `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  return PDFString.of(text);
}

function appearance(pdfDoc: PDFDocument, bbox: Bounds, content: string, resources: Record<string, any>, matrix?: number[]): PDFRef {
  const { context } = pdfDoc;
  const stream = context.stream(content, { Type: 'XObject', Subtype: 'Form', BBox: bbox, Resources: resources, ...(matrix ? { Matrix: matrix } : {}) });
  return context.register(stream);
}

/** The filled circle with the white number, drawn in a BBox of [0 0 size size]. */
function badgeContent(label: string): string {
  const r = BADGE_SIZE / 2;
  const k = r * KAPPA;
  const fontSize = label.length > 2 ? 5 : label.length > 1 ? 6.5 : 8;
  const textWidth = label.length * 0.556 * fontSize;
  const { r: cr, g: cg, b: cb } = hexToRgbFractions(COMMENT_BADGE_COLOR, '#0F766E');
  return [
    `${fixed(cr)} ${fixed(cg)} ${fixed(cb)} rg`,
    `${fixed(r * 2)} ${fixed(r)} m`,
    `${fixed(r * 2)} ${fixed(r + k)} ${fixed(r + k)} ${fixed(r * 2)} ${fixed(r)} ${fixed(r * 2)} c`,
    `${fixed(r - k)} ${fixed(r * 2)} 0 ${fixed(r + k)} 0 ${fixed(r)} c`,
    `0 ${fixed(r - k)} ${fixed(r - k)} 0 ${fixed(r)} 0 c`,
    `${fixed(r + k)} 0 ${fixed(r * 2)} ${fixed(r - k)} ${fixed(r * 2)} ${fixed(r)} c f`,
    `BT 1 g /F1 ${fixed(fontSize)} Tf ${fixed(r - textWidth / 2)} ${fixed(r - fontSize * 0.35)} Td (${label}) Tj ET`,
  ].join('\n');
}

/**
 * ISO 32000 12.5.6.10: one `/Highlight` annotation per element, so any viewer lists it, shows its
 * comment and prints it. The appearance stream paints the quads with Multiply, so it also renders
 * the same everywhere. sign.js wraps serialize in the editor-to-PDF `cm`, but annotations live in
 * raw user space, so every corner is mapped through `editorToPdf` here.
 */
export function serializeHighlight(element: HighlightElement, context: SerializeContext): void {
  const { pdfDoc, page, pdfWidth, pdfHeight, pdfX, pdfY, pageGeometry, commentNumber } = context;
  const toUser = (x: number, y: number): Point => {
    const p = applyAffineTransform({ x, y }, pageGeometry?.editorToPdf ?? IDENTITY);
    return [p.x, p.y];
  };
  const boxWidth = percentToPoints(element.width, pdfWidth);
  const boxHeight = percentToPoints(element.height, pdfHeight);
  const edges = element.bands.map((band) => {
    const left = pdfX + (band.left / 100) * boxWidth;
    const top = pdfY - (band.top / 100) * boxHeight;
    return { left, right: left + (band.width / 100) * boxWidth, top, bottom: top - (band.height / 100) * boxHeight };
  });
  // Upper-left, upper-right, lower-left, lower-right of the band as displayed.
  const quads = edges.map((e) => [toUser(e.left, e.top), toUser(e.right, e.top), toUser(e.left, e.bottom), toUser(e.right, e.bottom)]);
  const rect = boundsOf(quads.flat());
  const { r, g, b } = hexToRgbFractions(element.color, DEFAULT_HIGHLIGHT_COLOR);

  const paint = quads.map(([ul, ur, ll, lr]) => `${ul.map(fixed).join(' ')} m ${ur.map(fixed).join(' ')} l ${lr.map(fixed).join(' ')} l ${ll.map(fixed).join(' ')} l h f`);
  const ap = appearance(pdfDoc, rect, [`/GS gs ${fixed(r)} ${fixed(g)} ${fixed(b)} rg`, ...paint].join('\n'),
    { ExtGState: { GS: { Type: 'ExtGState', BM: 'Multiply' } } });

  const comment = element.comment?.trim() ? element.comment : undefined;
  const { context: pdfContext } = pdfDoc;
  const highlight = pdfContext.obj({
    Type: 'Annot', Subtype: 'Highlight', Rect: rect, QuadPoints: quads.flat(2), C: [r, g, b], CA: 1, F: 4,
    NM: PDFHexString.fromText(element.id), M: pdfDate(), AP: { N: ap },
    ...(comment ? { Contents: PDFHexString.fromText(comment) } : {}),
  });
  const highlightRef = pdfContext.register(highlight);
  page.node.addAnnot(highlightRef);

  if (comment) {
    // Beside the passage, in displayed (editor) space.
    const right = Math.max(...edges.map((e) => e.right));
    const top = Math.max(...edges.map((e) => e.top));
    const popupRect = boundsOf([toUser(right + 4, top), toUser(right + 4 + POPUP_WIDTH, top - POPUP_HEIGHT)]);
    const popupRef = pdfContext.register(pdfContext.obj({ Type: 'Annot', Subtype: 'Popup', Rect: popupRect, Parent: highlightRef, Open: false, F: 28 }));
    highlight.set(PDFName.of('Popup'), popupRef);
    page.node.addAnnot(popupRef);
  }

  if (commentNumber !== undefined) {
    const first = edges[0];
    const rtl = element.direction === 'rtl';
    const left = rtl ? first.right + BADGE_GAP : first.left - BADGE_GAP - BADGE_SIZE;
    const middle = (first.top + first.bottom) / 2;
    const badgeRect = boundsOf([toUser(left, middle + BADGE_SIZE / 2), toUser(left + BADGE_SIZE, middle - BADGE_SIZE / 2)]);
    const label = String(commentNumber);
    const fonts = { Font: { F1: { Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica-Bold', Encoding: 'WinAnsiEncoding' } } };
    const [ma, mb, mc, md] = pageGeometry?.editorToPdf ?? IDENTITY;
    // A turned page: draw in the badge's own square and let /Matrix carry the page's rotation, so the digit
    // reads upright as displayed (12.5.5 maps the transformed BBox onto Rect).
    const turned = ma !== 1 || mb !== 0 || mc !== 0 || md !== 1;
    const badgeAp = turned
      ? appearance(pdfDoc, [0, 0, BADGE_SIZE, BADGE_SIZE], badgeContent(label), fonts, [ma, mb, mc, md, 0, 0])
      : appearance(pdfDoc, [badgeRect[0], badgeRect[1], badgeRect[2], badgeRect[3]],
        `1 0 0 1 ${fixed(badgeRect[0])} ${fixed(badgeRect[1])} cm\n${badgeContent(label)}`, fonts);
    const badgeRef = pdfContext.register(pdfContext.obj({
      Type: 'Annot', Subtype: 'FreeText', Rect: badgeRect, F: 4, Contents: PDFHexString.fromText(label),
      DA: PDFString.of('1 g /F1 8 Tf'), IRT: highlightRef, RT: 'Group', M: pdfDate(), AP: { N: badgeAp },
    }));
    page.node.addAnnot(badgeRef);
  }
}
