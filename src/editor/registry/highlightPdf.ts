import { PDFHexString, PDFName, PDFString } from '@cantoo/pdf-lib';
import type { PDFDocument, PDFRef } from '@cantoo/pdf-lib';
import type { HighlightBand, HighlightElement } from '../model/editorModel.ts';
import type { SerializeContext } from './types.ts';
import { DEFAULT_HIGHLIGHT_COLOR } from '../model/highlightColors.ts';
import { hexToRgbFractions } from '../text/imageTint.js';
import { UNDERLINE_LIFT, UNDERLINE_WIDTH, underlineInk } from '../model/underlineInk.ts';
import { applyAffineTransform, percentToPoints } from '../geometry/coords.ts';
import type { AffineTransform } from '../geometry/coords.ts';

const POPUP_WIDTH = 160;
const POPUP_HEIGHT = 80;
const IDENTITY: AffineTransform = [1, 0, 0, 1, 0, 0];

type Point = [number, number];
type Bounds = [number, number, number, number];
interface Edge { left: number; right: number; top: number; bottom: number }

export const fixed = (n: number) => String(Math.round(n * 1000) / 1000);
export const boundsOf = (points: Point[]): Bounds => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

/** `D:YYYYMMDDHHmmSSZ`, the PDF date string for "now" in UTC. */
export function pdfDate(date = new Date()): PDFString {
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

/** Maps an editor-space point to the page's raw user space (annotations live outside the page's `cm`). */
export const userSpace = (context: SerializeContext) => (x: number, y: number): Point => {
  const p = applyAffineTransform({ x, y }, context.pageGeometry?.editorToPdf ?? IDENTITY);
  return [p.x, p.y];
};

interface BandsHighlightSpec {
  id: string;
  /** The box the bands are percentages of, in percent of the page. */
  box: { left: number; top: number; width: number; height: number };
  bands: HighlightBand[];
  color: string;
  fallbackColor: string;
  direction?: 'ltr' | 'rtl';
  /** Quarter turns the person gave the page, so the text's own bottom edge is found under the turned band; absent is 0. */
  quarterTurns?: 0 | 1 | 2 | 3;
  /** `'underline'` writes `/Underline`; absent writes `/Highlight`. */
  style?: 'underline';
  /** 0.3 to 1, absent is 1: written as `/CA` and as the appearance's `ca`. */
  opacity?: number;
  /** An underline's line width in points; absent is UNDERLINE_WIDTH.default. */
  strokeWidth?: number;
  comment?: { text: string; commentedAt?: number };
  /** The Print flag: a highlight prints, a comment's tint does not. */
  print: boolean;
}

/** The band's corners [ul, ur, ll, lr] as displayed, in the text's own order (QuadPoints are text-relative, ISO 32000 12.5.6.10) after `turns` clockwise quarter turns. */
export function textCorners([ul, ur, ll, lr]: Point[], turns: 0 | 1 | 2 | 3): Point[] {
  return [[ul, ur, ll, lr], [ur, lr, ul, ll], [lr, ll, ur, ul], [ll, ul, lr, ur]][turns];
}

/** READ-03: a stroke (UNDERLINE_WIDTH.default pt unless set) along a band's bottom edge, its bottom UNDERLINE_LIFT pt above the band's, in user space (works on a rotated page). */
function underlineLine(ul: Point, ll: Point, lr: Point, width: number): string {
  const dx = ul[0] - ll[0];
  const dy = ul[1] - ll[1];
  const length = Math.hypot(dx, dy) || 1;
  const inset = (UNDERLINE_LIFT + width / 2) / length;
  const shift = (p: Point) => [p[0] + dx * inset, p[1] + dy * inset].map(fixed).join(' ');
  return `${shift(ll)} m ${shift(lr)} l S`;
}

/**
 * ISO 32000 12.5.6.10: one `/Highlight` (or, for `style: 'underline'`, `/Underline`) annotation, so any viewer lists it, shows its comment and (when
 * `print`) prints it. The appearance stream paints the quads with Multiply, so it also renders the same
 * everywhere (a non-printed comment's is empty and its `/C` is `[]`, transparent per 12.5.2, so no viewer
 * paints a tint). sign.js wraps serialize in the editor-to-PDF `cm`, but annotations live in raw user space,
 * so every corner is mapped through `editorToPdf` here. Returns the annotation's ref and the band edges.
 */
export function writeBandsHighlight(spec: BandsHighlightSpec, context: SerializeContext): { ref: PDFRef; edges: Edge[] } {
  const { pdfDoc, page, pdfWidth, pdfHeight, pdfX, pdfY } = context;
  const toUser = userSpace(context);
  const boxWidth = percentToPoints(spec.box.width, pdfWidth);
  const boxHeight = percentToPoints(spec.box.height, pdfHeight);
  const edges: Edge[] = spec.bands.map((band) => {
    const left = pdfX + (band.left / 100) * boxWidth;
    const top = pdfY - (band.top / 100) * boxHeight;
    return { left, right: left + (band.width / 100) * boxWidth, top, bottom: top - (band.height / 100) * boxHeight };
  });
  // Upper-left, upper-right, lower-left, lower-right of the text's band (reordered when the page is turned).
  const quads = edges.map((e) => textCorners([toUser(e.left, e.top), toUser(e.right, e.top), toUser(e.left, e.bottom), toUser(e.right, e.bottom)], spec.quarterTurns ?? 0));
  const rect = boundsOf(quads.flat());
  const { r, g, b } = hexToRgbFractions(spec.color, spec.fallbackColor);

  const opacity = spec.opacity ?? 1;
  const underline = spec.style === 'underline';
  const width = spec.strokeWidth ?? UNDERLINE_WIDTH.default;
  const paint = spec.print ? quads.map(([ul, ur, ll, lr]) => (underline ? underlineLine(ul, ll, lr, width) : `${ul.map(fixed).join(' ')} m ${ur.map(fixed).join(' ')} l ${lr.map(fixed).join(' ')} l ${ll.map(fixed).join(' ')} l h f`)) : [];
  const ink = hexToRgbFractions(underlineInk(spec.color), spec.fallbackColor);
  const setup = underline ? `${fixed(width)} w ${fixed(ink.r)} ${fixed(ink.g)} ${fixed(ink.b)} RG` : `${fixed(r)} ${fixed(g)} ${fixed(b)} rg`;
  const content = spec.print ? ['/GS gs', setup, ...paint].join('\n') : '';
  const ap = appearance(pdfDoc, rect, content,
    { ExtGState: { GS: { Type: 'ExtGState', BM: 'Multiply', ca: opacity, CA: opacity } } });

  const text = spec.comment?.text.trim() ? spec.comment.text : undefined;
  const commentedAt = spec.comment?.commentedAt;
  const { context: pdfContext } = pdfDoc;
  const highlight = pdfContext.obj({
    Type: 'Annot', Subtype: underline ? 'Underline' : 'Highlight', Rect: rect, QuadPoints: quads.flat(2), C: spec.print ? [r, g, b] : [], CA: opacity, ...(spec.print ? { F: 4 } : {}), ...(underline ? { BS: { W: width } } : {}),
    NM: PDFHexString.fromText(spec.id), M: pdfDate(commentedAt === undefined ? undefined : new Date(commentedAt)), AP: { N: ap },
    ...(text ? { Contents: PDFHexString.fromText(text) } : {}),
  });
  const highlightRef = pdfContext.register(highlight);
  page.node.addAnnot(highlightRef);

  if (text) {
    // Beside the passage, in displayed (editor) space.
    const right = Math.max(...edges.map((e) => e.right));
    const top = Math.max(...edges.map((e) => e.top));
    const popupRect = boundsOf([toUser(right + 4, top), toUser(right + 4 + POPUP_WIDTH, top - POPUP_HEIGHT)]);
    const popupRef = pdfContext.register(pdfContext.obj({ Type: 'Annot', Subtype: 'Popup', Rect: popupRect, Parent: highlightRef, Open: false, F: 24 }));
    highlight.set(PDFName.of('Popup'), popupRef);
    page.node.addAnnot(popupRef);
  }

  return { ref: highlightRef, edges };
}

export function serializeHighlight(element: HighlightElement, context: SerializeContext): void {
  writeBandsHighlight({
    id: element.id, box: element, bands: element.bands, color: element.color, fallbackColor: DEFAULT_HIGHLIGHT_COLOR,
    direction: element.direction, style: element.style, opacity: element.opacity, strokeWidth: element.strokeWidth, comment: context.comment, print: true, quarterTurns: context.quarterTurns,
  }, context);
}
