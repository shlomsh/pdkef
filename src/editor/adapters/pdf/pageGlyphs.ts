/**
 * RED-12: every glyph a page's content shows, with its exact place, read from
 * the pdf.js operator list. pdf.js has already decoded each glyph (its
 * Unicode value and advance) and turned TJ, ' and " into plain `showText`;
 * this replays only the text state its canvas uses to place them
 * (`CanvasGraphics.showText`), so a glyph lands where pdf.js paints it.
 * Pure; no pdf.js import, the caller passes the operator ids.
 *
 * Text items from `getTextContent` give one advance per run, not per glyph,
 * and splitting it by a measurement put a word's edge a median 0.12 em (p90
 * 0.35 em) from its real glyphs on the real forms (RED-12 spike). What a box
 * covers is decided on these positions instead.
 */

import { composeAffineTransforms, type AffineTransform } from '../../geometry/coords.ts';

/** One shown glyph. Its em box maps through `matrix`: x from 0 to `width`
 * along the baseline, y up from the baseline, 1 = the font size. */
export interface PageGlyph {
  unicode: string;
  isSpace: boolean;
  /** Glyph em space to PDF user space, origin at the glyph's pen position. */
  matrix: AffineTransform;
  /** Advance in ems, without character or word spacing. */
  width: number;
}

/** The operator ids this reader needs (a subset of pdf.js's `OPS`). */
export interface TextOps {
  save: number;
  restore: number;
  transform: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  beginText: number;
  setCharSpacing: number;
  setWordSpacing: number;
  setHScale: number;
  setLeading: number;
  setLeadingMoveText: number;
  setFont: number;
  setTextRise: number;
  moveText: number;
  setTextMatrix: number;
  nextLine: number;
  showText: number;
  setGState: number;
  setTextRenderingMode: number;
}

/** What the reader needs of a loaded font (pdf.js's `commonObjs` entry). */
export interface GlyphFontInfo {
  fontMatrix?: number[];
  vertical?: boolean;
}

interface GlyphLike {
  unicode?: string;
  width?: number;
  isSpace?: boolean;
}

interface State {
  ctm: AffineTransform;
  textMatrix: AffineTransform;
  x: number;
  y: number;
  lineX: number;
  lineY: number;
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  leading: number;
  rise: number;
  fontSize: number;
  fontDirection: number;
  font: GlyphFontInfo | null;
  renderingMode: number;
}

const IDENTITY: AffineTransform = [1, 0, 0, 1, 0, 0];
const DEFAULT_FONT_MATRIX = [0.001, 0, 0, 0.001, 0, 0];

function initialState(): State {
  return {
    ctm: IDENTITY,
    textMatrix: IDENTITY,
    x: 0,
    y: 0,
    lineX: 0,
    lineY: 0,
    charSpacing: 0,
    wordSpacing: 0,
    hScale: 1,
    leading: 0,
    rise: 0,
    fontSize: 0,
    fontDirection: 1,
    font: null,
    renderingMode: 0,
  };
}

/**
 * Every glyph the page shows, in content order. Skipped: vertical fonts
 * (their glyphs advance down the page and nothing on the layer's side writes
 * them), anything shown with no font or at size 0, and invisible text
 * (render modes 3 and 7). Invisible text is usually a scan's OCR layer, whose
 * positions nothing on the page confirms: a word misplaced by the OCR could
 * sit clear of a box drawn over the scanned word it stands for. Reading back
 * a layer this module's own export wrote, which is invisible text by design,
 * pass `{ invisibleText: true }`.
 */
export function readPageGlyphs(
  operatorList: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> },
  ops: TextOps,
  fontInfo: (name: string) => GlyphFontInfo | null | undefined,
  { invisibleText = false }: { invisibleText?: boolean } = {},
): PageGlyph[] {
  const glyphs: PageGlyph[] = [];
  const stack: State[] = [];
  let s = initialState();

  const setFont = (name: string, size: number) => {
    s.font = fontInfo(name) ?? null;
    s.fontDirection = size < 0 ? -1 : 1;
    s.fontSize = Math.abs(size);
  };

  const moveText = (x: number, y: number) => {
    s.lineX += x;
    s.lineY += y;
    s.x = s.lineX;
    s.y = s.lineY;
  };

  for (let i = 0; i < operatorList.fnArray.length; i += 1) {
    const fn = operatorList.fnArray[i];
    const args = (operatorList.argsArray[i] ?? []) as any[];
    switch (fn) {
      case ops.save:
        stack.push({ ...s });
        break;
      case ops.restore:
        s = stack.pop() ?? s;
        break;
      case ops.transform:
        s.ctm = composeAffineTransforms(s.ctm, args as unknown as AffineTransform);
        break;
      case ops.paintFormXObjectBegin:
        stack.push({ ...s });
        if (Array.isArray(args[0]) && args[0].length === 6) {
          s.ctm = composeAffineTransforms(s.ctm, args[0] as unknown as AffineTransform);
        }
        break;
      case ops.paintFormXObjectEnd:
        s = stack.pop() ?? s;
        break;
      case ops.beginText:
        s.textMatrix = IDENTITY;
        s.x = s.lineX = 0;
        s.y = s.lineY = 0;
        break;
      case ops.setCharSpacing:
        s.charSpacing = args[0];
        break;
      case ops.setWordSpacing:
        s.wordSpacing = args[0];
        break;
      case ops.setHScale:
        s.hScale = args[0] / 100;
        break;
      case ops.setLeading:
        s.leading = -args[0];
        break;
      case ops.setLeadingMoveText:
        s.leading = args[1];
        moveText(args[0], args[1]);
        break;
      case ops.setFont:
        setFont(args[0], args[1]);
        break;
      case ops.setGState:
        for (const [key, value] of (args[0] ?? []) as [string, any][]) {
          if (key === 'Font' && Array.isArray(value)) setFont(value[0], value[1]);
        }
        break;
      case ops.setTextRenderingMode:
        s.renderingMode = args[0];
        break;
      case ops.setTextRise:
        s.rise = args[0];
        break;
      case ops.moveText:
        moveText(args[0], args[1]);
        break;
      case ops.setTextMatrix:
        s.textMatrix = args[0] as AffineTransform;
        s.x = s.lineX = 0;
        s.y = s.lineY = 0;
        break;
      case ops.nextLine:
        moveText(0, s.leading);
        break;
      case ops.showText:
        showText(args[0] ?? []);
        break;
      default:
        break;
    }
  }
  return glyphs;

  function showText(items: (GlyphLike | number)[]) {
    const font = s.font;
    if (!font || s.fontSize === 0) return;
    const fontMatrix = font.fontMatrix ?? DEFAULT_FONT_MATRIX;
    const scale = s.fontSize * fontMatrix[0];
    const hScale = s.hScale * s.fontDirection;
    const base = composeAffineTransforms(s.ctm, s.textMatrix);
    const invisible = !invisibleText && (s.renderingMode & 3) === 3;
    let x = 0;
    for (const item of items) {
      if (typeof item === 'number') {
        x -= (item * s.fontSize) / 1000;
        continue;
      }
      const width = item.width ?? 0;
      if (!font.vertical && !invisible && typeof item.unicode === 'string') {
        const origin = s.x + x * hScale;
        glyphs.push({
          unicode: item.unicode,
          isSpace: Boolean(item.isSpace),
          matrix: composeAffineTransforms(base, [s.fontSize * hScale, 0, 0, s.fontSize, origin, s.y + s.rise]),
          width: (width * scale) / s.fontSize,
        });
      }
      const spacing = (item.isSpace ? s.wordSpacing : 0) + s.charSpacing;
      x += width * scale + spacing * s.fontDirection;
    }
    s.x += x * hScale;
  }
}
