import type { ElementDefinition } from './types.ts';
import type { TextElement } from '../../lib/editorModel.ts';
import { h } from 'preact';
import {
  PDFHexString, rgb,
  beginText, endText, popGraphicsState, pushGraphicsState,
  setFillingColor, setFontAndSize, setTextMatrix, setTextRise, showText,
} from '@cantoo/pdf-lib';
import type { Color, PDFFont, PDFName, PDFPage } from '@cantoo/pdf-lib';
import TextNode from '../../components/SignTool/nodes/TextNode.tsx';
import { hasNumber, hasString, isRecord } from './schema.ts';
import { COMB_MIN_CELL_EM, MAX_FONT_SIZE_PT, MIN_COMB_WIDTH_PCT, MIN_FONT_SIZE_PT, TEXT_RESIZE_SCALE_FACTOR } from '../../constants/signGeometry.js';
import { DEFAULT_FONT_SIZE_PT, DEFAULT_LINE_HEIGHT_EM } from '../../constants/signGeometry.js';
import { combCellCount, combCharacters, combCellCenterFraction, isComb } from '../../lib/comb.js';
import { resolveBidiRuns } from '../../lib/bidiRuns.js';
import { getEffectiveTextDirection, hexToRgbFractions } from '../../lib/signHelpers.js';
import { resolveFontFamily, textBoxPaddingEm } from '../../lib/fonts.js';
import type { TextPositionInput, TextPositionPatch, TextResizeInput, TextResizePatch, WidthFloorInput, WidthResizeInput, WidthResizePatch } from './types.ts';
import elementStyles from '../../components/SignTool/EditorElement.module.css';

type BidiDirection = 'ltr' | 'rtl';

type FontkitFont = {
  unitsPerEm: number;
  // Real signature is (string, features, script, language, direction) - see
  // node_modules/@pdf-lib/fontkit's LayoutEngine.layout. `direction` lets a
  // caller that has already split a line into single-direction runs (see
  // src/lib/bidiRuns.js) tell fontkit which one, instead of leaving fontkit
  // to guess from the run's own content - required for a run with no strong
  // character of its own (e.g. a lone separator) to shape deterministically.
  layout: (text: string, features?: undefined, script?: undefined, language?: undefined, direction?: BidiDirection) => { glyphs: { id: number }[]; positions: { xAdvance: number; xOffset: number; yOffset: number }[] };
  hasGlyphForCodePoint: (codePoint: number) => boolean;
};

// `embedder` is a private field of PDFFont, reached the same way sign.js's
// baselineOffsetEm() already reads ascent/descent, guard and all. Exported so
// sign.js's unrepresentable-character pre-pass (see docs/hebrew-text-shaping-
// export.md, "Layer 3") shares this one accessor instead of a second copy.
export function fontkitFont(pdfFont: PDFFont | null): FontkitFont | null {
  const fk = (pdfFont as unknown as { embedder?: { font?: FontkitFont } } | null)?.embedder?.font;
  return fk?.unitsPerEm ? fk : null;
}

/**
 * Strips Unicode control (`\p{Cc}`) and format (`\p{Cf}`) characters from
 * `text`, mapping TAB to a single space (the editor's own textarea gives it
 * visible width, so dropping it outright would close up a gap the user
 * actually typed) and removing everything else in those categories outright.
 *
 * These are exactly the characters this catalogue's coverage is shakiest on
 * - TAB is missing from every bundled font, and Gveret Levin and Heebo are
 * also missing soft hyphen, ZWSP, LRM/RLM, word joiner, BOM and the
 * embedding-direction controls (measured with
 * `hasGlyphForCodePoint`, the same way `fontCoverage.test.js` judges Hebrew
 * coverage). LRM/RLM specifically ride along invisibly in Hebrew text copied
 * from the web, Word or WhatsApp - exactly how this app's users get their
 * text - so without this, `unrepresentableCharacters` below would refuse a
 * whole document over a character the user cannot see, find, or delete.
 * Verified separately: fontkit's `layout()` substitutes a harmless
 * zero-width space glyph for most of these (they are Unicode
 * "default-ignorable" format characters), but not for TAB, which is a
 * control character rather than a format one and does draw a literal
 * `.notdef` glyph if it reaches `layout()` unstripped.
 *
 * Applied on both the coverage check and wherever shaped text is actually
 * measured/drawn (`serialize`, below) via this one function, so the two can
 * never disagree - stripping only in the coverage check would let a document
 * pass and still draw whatever this was meant to keep off the page.
 *
 * Callers that care about real line breaks must split on `\r?\n` *before*
 * calling this, not after: `\n`/`\r` are themselves `\p{Cc}` and would
 * otherwise be stripped before there is anything left to split on.
 */
export function stripInvisibleFormatting(text: string): string {
  return text.replace(/[\p{Cc}\p{Cf}]/gu, (ch) => (ch === '\t' ? ' ' : ''));
}

/**
 * The half of the strip that is safe to run BEFORE bidi resolution: TAB
 * becomes a space and nothing else changes.
 *
 * **`stripInvisibleFormatting` must never run before `resolveBidiRuns`.**
 * LRM/RLM (U+200E/200F) and the embedding controls (U+202A-202E, U+2066-2069)
 * are `\p{Cf}`, and they are the characters that *steer* UAX#9 - removing them
 * first deletes the input the algorithm is supposed to read. Measured on
 * `"הקובץ ‎(v2)‎ מוכן"`, which is ordinary text pasted from Word or WhatsApp:
 * with the marks it resolves the way the editor shows it, and stripped first
 * it resolves to `") מוכןv2הקובץ ("` - the parentheses torn off `v2` and
 * thrown to opposite ends of the line.
 *
 * So the order is: normalize TAB, resolve bidi with the marks intact, then
 * strip each resolved run (UAX#9 rule X9 removes the controls from display
 * once they have done their job). `serialize` below does exactly that.
 */
export function normalizeTabsForBidi(text: string): string {
  return text.replace(/\t/g, ' ');
}

/**
 * Characters in `text` this font has no glyph for, deduplicated and in first-
 * seen order - empty when every character is covered, or when this font has
 * no reachable fontkit instance (the caller then has no way to know, and
 * `serialize`'s own drawText fallback is what runs in that case anyway).
 * Checks `text` after `stripInvisibleFormatting` (above), so a control or
 * format character that never reaches the page is never a reason to refuse
 * one either.
 *
 * Checked with `hasGlyphForCodePoint`, not by running `layout()` and looking
 * for glyph id 0 - `fontCoverage.test.js` already judges Hebrew coverage this
 * way against the same real asset bytes, and it sidesteps having to map
 * shaped glyphs (which can merge or reorder) back to input characters. It
 * also sidesteps a real fontkit trap: its glyph objects are cached by id, so
 * every `.notdef` after the first in a given font instance carries the
 * *first* one's stale `codePoints`, not its own - `layout()`-based detection
 * cannot reliably name a second or third missing character at all.
 */
export function unrepresentableCharacters(pdfFont: PDFFont | null, text: string): string[] {
  const fk = fontkitFont(pdfFont);
  if (!fk) return [];
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const ch of Array.from(stripInvisibleFormatting(text))) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    if (!fk.hasGlyphForCodePoint(ch.codePointAt(0) as number)) missing.push(ch);
  }
  return missing;
}

const gidHex = (id: number) => id.toString(16).toUpperCase().padStart(4, '0');

/**
 * `drawShapedRun` below emits raw fontkit glyph ids (`gidHex(glyph.id)`)
 * straight into the PDF, which is only valid because `embedFont()` defaults
 * to `subset: false` (@cantoo/pdf-lib's `CustomFontEmbedder.encodeText` does
 * the same - see its source). A *subset* embedder
 * (`CustomFontSubsetEmbedder`) remaps every id through `includeGlyph()`,
 * which is also what registers a glyph into the subset in the first place,
 * so a raw id emitted here would silently point at the wrong glyph (or none)
 * against a subset font's `/Differences`. Neither class is part of pdf-lib's
 * public API, so this can't `instanceof`-check against it - `subset` is set
 * only in `CustomFontSubsetEmbedder`'s constructor, which is what the guard
 * below actually detects. This should never fire today; it exists so turning
 * subsetting on later fails loudly here instead of drifting silently.
 */
function assertNotSubsetEmbedded(pdfFont: PDFFont): void {
  const embedder = (pdfFont as unknown as { embedder?: { subset?: unknown } }).embedder;
  if (embedder && 'subset' in embedder) {
    throw new Error('drawShapedRun emits raw fontkit glyph IDs and cannot be used with a subset-embedded font (embedFont(..., { subset: true })) - see the comment on assertNotSubsetEmbedded in text.ts');
  }
}

/**
 * Per-page cache of the `/Font` resource key for a given embedded font, so
 * repeated `drawShapedRun` calls for the same font on the same page reuse one
 * `/Font` dictionary entry instead of minting a new one every call.
 * `page.node.newFontDictionary()` (an @cantoo/pdf-lib internal) calls
 * `Font.uniqueKey(tag)` with no dedup of its own - measured, a 3-line element
 * plus a 12-cell comb produced 15 entries for one font before this cache.
 * Keyed by the font ref's string tag (stable across calls on the same
 * embedded font - PDFRef itself is pool-interned by that same tag) rather
 * than the PDFFont object, since object identity isn't the actual identity
 * pdf-lib cares about here.
 */
const fontDictionaryKeysByPage = new WeakMap<PDFPage, Map<string, PDFName>>();

function fontDictionaryKey(page: PDFPage, pdfFont: PDFFont): PDFName {
  let keysForPage = fontDictionaryKeysByPage.get(page);
  if (!keysForPage) {
    keysForPage = new Map();
    fontDictionaryKeysByPage.set(page, keysForPage);
  }
  const refTag = pdfFont.ref.toString();
  const cached = keysForPage.get(refTag);
  if (cached) return cached;
  const key = page.node.newFontDictionary(pdfFont.name, pdfFont.ref);
  keysForPage.set(refTag, key);
  return key;
}

/**
 * Shaped width in points, or `null` when this font's fontkit instance isn't
 * reachable - the caller's signal to fall back to `page.drawText()` unchanged.
 *
 * `direction`, when given, is passed straight through to fontkit's own
 * `layout()` - see the comment on `FontkitFont.layout` above. Omit it for
 * text whose direction fontkit can safely guess on its own (a full
 * single-direction string); pass it for a run produced by
 * `resolveBidiRuns()` (src/lib/bidiRuns.js), which already knows the run's
 * true direction and must not leave fontkit to re-derive it.
 */
/**
 * Splits one resolved bidi run into the segments the browser would shape
 * separately, in the order they appear left to right.
 *
 * Blink shapes and caches text **word by word** (its ShapeCache), so any font
 * feature whose context crosses a space never fires on screen. fontkit, given
 * a whole line, does fire it. Measured: `Tel Aviv` in Arimo comes out 113 font
 * units narrower than the browser draws it, purely from a kern pair spanning
 * the space, while `Tel`, `Av` and a lone space each match exactly. Shaping per
 * segment brings every catalogued font to exact agreement with the browser.
 * (It took six of seven when measured; the seventh disagreed for a reason no
 * pipeline stage could fix and was dropped from the catalogue instead - see
 * RETIRED_FONTS in src/lib/fonts.js and docs/hebrew-text-shaping-export.md.)
 *
 * **An RTL run's segments are reversed**, which is UAX#9 rule L2 applied again
 * at segment granularity: the first-typed word belongs at the right-hand end.
 * Verified against fontkit itself - shaping the segments of `שלום עולם` in
 * reversed order yields exactly the glyph sequence that shaping the whole run
 * yields, and forward order yields a different one.
 *
 * Note this deliberately matches *Chrome*. Word-by-word shaping is Blink's
 * caching strategy, not a specification, so parity here is parity with the
 * engine the editor ran in.
 */
function toShapingSegments(run: { text: string; direction: 'ltr' | 'rtl' }): { text: string; direction: 'ltr' | 'rtl' }[] {
  const parts = run.text.split(/( )/).filter((part) => part !== '');
  const ordered = run.direction === 'rtl' ? [...parts].reverse() : parts;
  return ordered.map((text) => ({ text, direction: run.direction }));
}

export function shapedWidth(pdfFont: PDFFont | null, text: string, size: number, direction?: BidiDirection): number | null {
  const fk = fontkitFont(pdfFont);
  if (!fk) return null;
  const { positions } = fk.layout(text, undefined, undefined, undefined, direction);
  return positions.reduce((sum, p) => sum + p.xAdvance, 0) * size / fk.unitsPerEm;
}

/**
 * Emits `text` with every glyph at its own shaped position (one `Tm`+`Tj`
 * pair per glyph), so marks land where the shaper puts them instead of by
 * raw advance width. `x` is the run's LEFT edge; a caller anchoring a right
 * edge (RTL, comb cells) must subtract shapedWidth() first.
 *
 * Never batch consecutive glyphs into one `showText` run as an optimisation -
 * a batched run advances by the PDF's `/W` widths, not the shaper's advances,
 * and drifts silently wherever the two disagree (see
 * docs/hebrew-text-shaping-export.md - this mangled Playpen Sans Hebrew in
 * the first prototype, and guarding against hmtx advance did not catch it).
 */
export function drawShapedRun(page: PDFPage, { text, pdfFont, size, x, y, color, direction }: { text: string; pdfFont: PDFFont; size: number; x: number; y: number; color: Color; direction?: BidiDirection }): void {
  const fk = fontkitFont(pdfFont);
  if (!fk) throw new Error('drawShapedRun requires a font with a reachable fontkit instance');
  assertNotSubsetEmbedded(pdfFont);
  const { glyphs, positions } = fk.layout(text, undefined, undefined, undefined, direction);
  const scale = size / fk.unitsPerEm;
  const fontKey = fontDictionaryKey(page, pdfFont);
  const ops = [pushGraphicsState(), beginText(), setFillingColor(color), setFontAndSize(fontKey, size)];
  let pen = x;
  glyphs.forEach((glyph, i) => {
    const { xOffset, yOffset, xAdvance } = positions[i];
    const rise = yOffset * scale;
    ops.push(setTextMatrix(1, 0, 0, 1, pen + xOffset * scale, y));
    if (rise) ops.push(setTextRise(rise));
    ops.push(showText(PDFHexString.of(gidHex(glyph.id))));
    if (rise) ops.push(setTextRise(0));
    pen += xAdvance * scale;
  });
  ops.push(endText(), popGraphicsState());
  page.pushOperators(...ops);
}

export function applyTextResize({ startFontSize, delta, startRect, fallbackDeltaPoints }: TextResizeInput): TextResizePatch {
  let fontSize = startFontSize;
  if (startRect && startRect.width > 0 && startRect.height > 0) {
    const scale = 1 + (delta.x * startRect.width + delta.y * startRect.height)
      / (startRect.width * startRect.width + startRect.height * startRect.height);
    fontSize = Math.round(startFontSize * scale);
  } else {
    fontSize = Math.round(startFontSize + fallbackDeltaPoints * TEXT_RESIZE_SCALE_FACTOR);
  }
  return { fontSize: Math.max(MIN_FONT_SIZE_PT, Math.min(MAX_FONT_SIZE_PT, fontSize)) };
}

export function applyTextPosition({ start, startSize, nextSize, isLeftHandle, isTopHandle, isRtl }: TextPositionInput): TextPositionPatch {
  let { left, top } = start;
  if (nextSize.width > 0 && startSize.width > 0) {
    if (isLeftHandle && !isRtl) left = start.left + startSize.width - nextSize.width;
    else if (!isLeftHandle && isRtl) left = start.left - startSize.width + nextSize.width;
  }
  if (nextSize.height > 0 && startSize.height > 0 && isTopHandle) {
    top = start.top + startSize.height - nextSize.height;
  }
  return { left, top };
}

/**
 * Side-handle drag on a comb: sets the span, never the font size.
 *
 * `left` is the anchored edge, which is the box's right edge in RTL (see the
 * usesRtlAnchoring view flag), so the handle that moves the anchor is the left
 * one in LTR and the right one in RTL. Only that handle repositions; dragging
 * the free edge just changes the width.
 */
export function applyCombWidth({ handle, delta, start, isRtl, minWidth }: WidthResizeInput): WidthResizePatch {
  const movesAnchor = isRtl ? handle === 'right' : handle === 'left';
  // Whether dragging rightward widens the box. Both the anchored RTL edge and
  // the free LTR edge do; the other two shrink it.
  const growsWithPointer = isRtl ? movesAnchor : !movesAnchor;
  const rawWidth = start.width + (growsWithPointer ? delta.x : -delta.x);
  const width = Math.max(minWidth, rawWidth);
  // Derived from the *clamped* width, so hitting the floor parks the anchor
  // instead of letting it keep sliding out from under a box that stopped shrinking.
  const left = movesAnchor
    ? start.left + (isRtl ? width - start.width : start.width - width)
    : start.left;
  // Dragging the span down past its usable floor and letting go there is
  // "close this comb" - a deliberate, visible gesture (the box visibly stops
  // shrinking at the floor before it happens) rather than a fuzzy proximity
  // check against the text's natural width, which would depend on font and
  // content and could fire while fine-tuning a span nowhere near where the
  // user meant to stop.
  return { left, width, collapsed: rawWidth < minWidth };
}

/**
 * Where a comb's span stops being worth having, as a % of page width.
 *
 * Derived from the cells rather than being a flat fraction of the page, because
 * that is the only version of the question with a real answer: a comb exists to
 * put one character in each printed box, so once a cell is narrower than the
 * character it holds there is nothing left to align and the element is just
 * text again. That lands the floor near the box's own natural text width, which
 * is what makes shrinking it back down a gesture someone can finish - a flat
 * percentage of the page would have to be dragged to a slit first, and would
 * sit in a different place relative to the text for every font size and length.
 */
export function combWidthFloor({ element, fontSizePx, pageWidthPx }: WidthFloorInput): number {
  if (!(pageWidthPx > 0) || !(fontSizePx > 0)) return MIN_COMB_WIDTH_PCT;
  const cellPitchPx = combCellCount(element as TextElement) * fontSizePx * COMB_MIN_CELL_EM;
  return Math.max(MIN_COMB_WIDTH_PCT, (cellPitchPx / pageWidthPx) * 100);
}

export const textDefinition: ElementDefinition<TextElement> = {
  type: 'text',
  schema: (value): value is TextElement => isRecord(value) && value.type === 'text' && hasString(value, 'id')
    && hasNumber(value, 'pageIndex') && hasNumber(value, 'left') && hasNumber(value, 'top') && hasString(value, 'text'),
  creation: {
    mode: 'point',
    // The click point is the middle of the box's anchored edge — its left edge
    // in LTR, its right edge in RTL (the anchored edge is `left` either way,
    // see the usesRtlAnchoring view flag). So the box is centered vertically on
    // the pointer rather than hanging below it.
    create: ({ id, pageIndex, point, color, font, fontSize, direction, textHeight = 0 }) => ({
      id, type: 'text', pageIndex, left: point.left, top: Math.max(0, point.top - textHeight / 2), text: '',
      fontSize, fontWeight: 'normal', fontStyle: 'normal', fontFamily: font, color,
      ...(direction != null ? { textDirection: direction } : {}),
    }),
  },
  // isActive/isEditing/onBeginEdit are placeholders: DraggableWrapper injects the
  // real values via cloneElement, the same channel onResizeStart arrives on.
  render: ({ element, onChange, onSelect, pageWidthPoints }) => h(TextNode, { element, onChange, onSelect, pageWidthPoints, isActive: false, isEditing: false, onBeginEdit: () => {}, onResizeStart: () => {} }),
  serialize: async (element, { page, pdfWidth, pdfX, pdfY, loadCustomFont, baselineOffset }) => {
    const { text, fontSize, fontFamily, fontWeight, fontStyle, color } = element;
    const textValue = (text || '').trim();
    if (!textValue) return;
    const fontSizeInPoints = fontSize || DEFAULT_FONT_SIZE_PT;
    // Same substitution the editor renders with, so the download matches the
    // screen even when the picked font has no glyph for what was typed.
    const embeddedFamily = resolveFontFamily(fontFamily, textValue);
    const resolvedFont = (await loadCustomFont(embeddedFamily, fontWeight, fontStyle)) || (await loadCustomFont('Arimo', fontWeight, fontStyle));
    if (!resolvedFont) throw new Error('Unable to load a PDF font for text export');
    const { r, g, b } = hexToRgbFractions(color);
    // Same per-font padding the editor renders with (fonts.js), so a face
    // whose box grew to fit its own tall ascenders on screen exports at the
    // same baseline instead of drifting once the extra padding is dropped.
    const baselineAdjustedY = pdfY - fontSizeInPoints * (baselineOffset(resolvedFont) + textBoxPaddingEm(embeddedFamily));
    const lineHeight = fontSizeInPoints * DEFAULT_LINE_HEIGHT_EM;
    const isRtl = getEffectiveTextDirection(element) === 'rtl';

    if (isComb(element)) {
      // One glyph run per character at a computed x, which is also why a comb
      // needs nothing from pdf-lib that plain text doesn't: no Tc operator, no
      // per-run kerning to defeat. Kerning is meaningless here anyway - the
      // printed cells, not the font, decide where each glyph goes.
      //
      // Also why it needs nothing from the bidi pre-pass above: each `char`
      // here is one `combCharacters()` cluster (a base character plus any
      // combining marks that follow it - see src/lib/comb.js), never more
      // than one base character, so it is never itself a mixed-direction run.
      // Cell order/position already comes from the cell index (mirrored for
      // RTL by `combCellCenterFraction`), not from a shaped line, so there is
      // no run-ordering step to get wrong here in the first place.
      const widthPoints = ((element.width || 0) / 100) * pdfWidth;
      const cellCount = combCellCount(element);
      // `pdfX` is the anchored edge, which is the box's right edge in RTL.
      const boxLeft = isRtl ? pdfX - widthPoints : pdfX;
      combCharacters(element).slice(0, cellCount).forEach((rawChar, index) => {
        // Same strip as the plain-line path below. A cell holding only an
        // invisible format character (a pasted ZWSP, say) keeps its cell, so
        // the cell count and every other cell's position are unchanged, but
        // draws nothing rather than a `.notdef` box.
        const char = stripInvisibleFormatting(rawChar);
        if (!char.trim()) return;
        const center = boxLeft + combCellCenterFraction(index, cellCount, isRtl) * widthPoints;
        const cellWidth = shapedWidth(resolvedFont, char, fontSizeInPoints);
        if (cellWidth === null) {
          const charWidth = resolvedFont.widthOfTextAtSize(char, fontSizeInPoints);
          page.drawText(char, { x: center - charWidth / 2, y: baselineAdjustedY, size: fontSizeInPoints, font: resolvedFont, color: rgb(r, g, b) });
          return;
        }
        drawShapedRun(page, { text: char, pdfFont: resolvedFont, size: fontSizeInPoints, x: center - cellWidth / 2, y: baselineAdjustedY, color: rgb(r, g, b) });
      });
      return;
    }

    // The element's one fixed paragraph direction, never re-detected per
    // line - the same contract `<textarea dir={textDirection}>` gives the
    // editor (see resolveBidiRuns's own doc in src/lib/bidiRuns.js and
    // docs/hebrew-text-shaping-export.md, "Layer 2").
    const paragraphDirection: 'ltr' | 'rtl' = isRtl ? 'rtl' : 'ltr';

    textValue.split(/\r?\n/).forEach((rawLine, lineIndex) => {
      // Split on real newlines first, since `\n` is itself `\p{Cc}` and the
      // strip below would remove it before there was anything to split on.
      // Only TAB is normalized here: the directional marks have to survive
      // into resolveBidiRuns, which is what reads them. See
      // normalizeTabsForBidi's own doc, and the measured example there.
      const line = normalizeTabsForBidi(rawLine);
      const y = baselineAdjustedY - lineIndex * lineHeight;
      // A line can mix directions (Hebrew beside a date, a phone number, a
      // Latin label...); shaping it as one fontkit call reverses either
      // everything or nothing, never just the right part (measured in
      // docs/hebrew-text-shaping-export.md, "Layer 2"). Split into UAX#9
      // runs first and shape/measure/draw each one separately, in the
      // resolved visual order - this is the same per-glyph-position
      // machinery as before, just called once per run instead of once per
      // line.
      // Strip only after bidi has read the marks (UAX#9 X9 removes them from
      // display once resolved), and drop any run left with nothing to draw.
      const runs = resolveBidiRuns(line, paragraphDirection)
        .map((run) => ({ ...run, text: stripInvisibleFormatting(run.text) }))
        .filter((run) => run.text !== '')
        // ...then split each run the way the browser does, at spaces, so a
        // feature whose context crosses one cannot fire here when it does not
        // fire on screen. See toShapingSegments.
        .flatMap(toShapingSegments);
      // The shaped width, not widthOfTextAtSize, for the RTL anchor - they
      // can disagree (widthOfTextAtSize sums hmtx advances; the shaper
      // reports what it will actually emit), and the shaped total is the one
      // the editor agrees with. Summed across runs now, since the line's
      // total width is no longer one shapedWidth call.
      const runWidths = runs.map((run) => shapedWidth(resolvedFont, run.text, fontSizeInPoints, run.direction));
      if (runWidths.some((runWidth) => runWidth === null)) {
        const fallbackLine = stripInvisibleFormatting(line);
        const width = resolvedFont.widthOfTextAtSize(fallbackLine, fontSizeInPoints);
        page.drawText(fallbackLine, { x: isRtl ? pdfX - width : pdfX, y, size: fontSizeInPoints, font: resolvedFont, color: rgb(r, g, b) });
        return;
      }
      const lineWidth = (runWidths as number[]).reduce((sum, runWidth) => sum + runWidth, 0);
      // The RTL anchor is the box's fixed right edge (usesRtlAnchoring), so
      // the run sequence's rightmost extent must land exactly on pdfX - start
      // the pen at the left end of the whole line (pdfX - lineWidth for RTL,
      // pdfX itself for LTR) and walk the runs left to right with an
      // increasing pen, same as the old single-call version did for the
      // whole line. Only the resolved VISUAL run order changes what gets
      // drawn where; the anchor math is unchanged.
      let pen = isRtl ? pdfX - lineWidth : pdfX;
      runs.forEach((run, runIndex) => {
        const runWidth = runWidths[runIndex] as number;
        drawShapedRun(page, { text: run.text, pdfFont: resolvedFont, size: fontSizeInPoints, x: pen, y, color: rgb(r, g, b), direction: run.direction });
        pen += runWidth;
      });
    });
  },
  view: { usesRtlAnchoring: true, usesIntrinsicSize: true, allowsExplicitWidth: true },
  resizeBehavior: {
    // Corners always mean font size; the side handles always mean comb span.
    // Both are always present - dragging a side handle is what turns comb on
    // (see useElementResize.js), and there is nothing left for a plain text
    // box to opt into first, so there's no per-element handle set to compute.
    handles: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'right'],
    applyTextResize,
    applyTextPosition,
    applyWidthResize: applyCombWidth,
    widthFloor: combWidthFloor,
    writeDOM: ({ node, patch, handle, isRtl, startLeft, startTop, scaleFactor, pageWrapper, textStartSizePercent, getElementPercentSize, element }) => {
      // Side-handle drag on a comb: span only, and the font size is left alone.
      if (patch.width !== undefined) {
        const textDisplay = node.querySelector(`.${elementStyles['text-display']}`) as HTMLElement | null;
        const textInput = node.querySelector(`.${elementStyles['text-input']}`) as HTMLElement | null;
        const combNode = node.querySelector(`.${elementStyles['text-comb']}`) as HTMLElement | null;

        // Dragged past the floor: paint exactly what releasing here commits -
        // a plain text box, at its own natural width, back on its original
        // anchor. Not a hint or a highlight, the actual result, because the
        // decision being previewed ("this stops being a comb") is one the box
        // can simply show. Clearing the explicit width is what does it: with
        // the span gone the box measures itself from its text again, the same
        // as any other text element (see TextNode's measure div, which keeps
        // holding the real text throughout precisely so this works).
        if (patch.collapsed) {
          node.style.width = '';
          if (isRtl) node.style.right = `${100 - startLeft}%`;
          else node.style.left = `${startLeft}%`;
          if (combNode) combNode.style.display = 'none';
          if (textInput) textInput.style.color = (element as TextElement).color || '#000000';
          textDisplay?.classList.remove(elementStyles['text-display-comb']);
          return;
        }

        node.style.width = `${patch.width}%`;
        if (isRtl) node.style.right = `${100 - (patch.left as number)}%`;
        else node.style.left = `${patch.left as number}%`;

        // The overlay is mounted but hidden from the moment a side handle is
        // grabbed (isSpanResizing in TextNode), so it is here to be shown the
        // first frame the drag clears the floor - the box looks untouched
        // until then, which is the honest picture of a gesture that has not
        // made a comb yet. Guarded anyway: the state flush that mounts it is
        // asynchronous and a fast first move can beat it to the screen, in
        // which case the next frame finds it. Never built here by hand - a
        // node this module creates would sit outside Preact's vnode tree for
        // this subtree, and the next real render would layer its own overlay
        // next to it instead of replacing it (two sets of characters).
        if (!combNode) return;
        combNode.style.display = '';
        textDisplay?.classList.add(elementStyles['text-display-comb']);
        if (textInput) textInput.style.color = 'transparent';

        // The cells' `left: X%` is nominally relative to this same box, so it
        // would in principle track the width above through CSS alone - but
        // that's a percentage grid track nested inside an ancestor whose size
        // was just set via a raw style mutation, not a plain 100% fill like
        // everywhere else in this file, and it isn't guaranteed to resolve in
        // the same paint. Reading the box's own just-set width back and
        // writing pixel offsets removes the question: the digits track the
        // span exactly as it's dragged, the same as the box's own outline,
        // not only once the drag is released.
        const widthPx = node.getBoundingClientRect().width;
        const cells = combNode.querySelectorAll(`.${elementStyles['text-comb-cell']}`);
        cells.forEach((cell, index) => {
          (cell as HTMLElement).style.left = `${combCellCenterFraction(index, cells.length, isRtl) * widthPx}px`;
        });
        // Guides render only for cells.slice(1), so the i-th guide node is
        // cell (i + 1)'s left boundary - mirrored the same way as the cells
        // themselves so the dividers still line up with the digits between them.
        combNode.querySelectorAll(`.${elementStyles['text-comb-guide']}`).forEach((guide, i) => {
          const boundary = (i + 1) / cells.length;
          (guide as HTMLElement).style.left = `${(isRtl ? 1 - boundary : boundary) * widthPx}px`;
        });
        return;
      }

      node
        .querySelectorAll(`.${elementStyles['text-display']}, .${elementStyles['text-input']}, .${elementStyles['text-measure']}`)
        .forEach((el) => { (el as HTMLElement).style.fontSize = `${(patch.fontSize as number) * scaleFactor}px`; });

      if (!textStartSizePercent) return;
      const newSize = getElementPercentSize(node, pageWrapper);
      const { left: newLeft, top: newTop } = applyTextPosition({
        start: { left: startLeft, top: startTop },
        startSize: textStartSizePercent,
        nextSize: newSize,
        isLeftHandle: ['left', 'top-left', 'bottom-left'].includes(handle),
        isTopHandle: ['top', 'top-left', 'top-right'].includes(handle),
        isRtl,
      });
      node.style.top = `${newTop}%`;
      if (isRtl) node.style.right = `${100 - newLeft}%`;
      else node.style.left = `${newLeft}%`;
      return { left: newLeft, top: newTop };
    },
  },
};
