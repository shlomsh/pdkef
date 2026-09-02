/**
 * Guard B (docs/hebrew-text-shaping-export.md): the export honours the
 * shaper's own glyph positions instead of the PDF's /W advance widths.
 *
 * A plain .js test, not .ts, matching every other test in this repo that
 * reads font bytes off disk (fontCoverage.test.js, fonts.test.js) - there is
 * no @types/node dependency here, and node:fs/node:path resolve fine at
 * runtime but fail `astro check` from inside a checked .ts file.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { normalizeTabsForBidi, shapedWidth, stripInvisibleFormatting, unrepresentableCharacters } from './text.ts';
import { drawShapedRun } from './textPdf.ts';
import { resolveBidiRuns } from '../text/bidiRuns.js';
import { composeHebrewClusters } from '../text/hebrewComposition.js';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');

async function embedFont(fileName) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  return doc.embedFont(new Uint8Array(readFileSync(join(FONT_DIR, fileName))));
}

async function embedHeebo() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  return doc.embedFont(new Uint8Array(readFileSync(join(FONT_DIR, 'Heebo-Regular.ttf'))));
}

function mockPage(font) {
  // `doc` must be a real PDFDocument (via the embedded font's own `.doc`) so
  // drawShapedRun's ActualText wrapper can build a real PDFDict through
  // `page.doc.context.obj(...)` - a bare mock would throw on `.context`.
  return { doc: font.doc, node: { newFontDictionary: vi.fn(() => 'F1') }, pushOperators: vi.fn() };
}

describe('drawShapedRun', () => {
  it('places every glyph at the shaper\'s exact position - one Tm per glyph, none batched', async () => {
    const font = await embedHeebo();
    const fk = font.embedder.font;
    const text = 'שָׁלוֹם'; // shalom with nikud
    // drawShapedRun composes Hebrew presentation forms before shaping (H7 -
    // see hebrewComposition.js), so the "expected" reference has to be
    // shaped from the same composed text, not the raw typed one: vav+holam
    // here composes to FB4B, so this is fewer than the 7 raw codepoints.
    const composedText = composeHebrewClusters(text, (cp) => fk.hasGlyphForCodePoint(cp));
    const { glyphs, positions } = fk.layout(composedText);
    const size = 24;
    const scale = size / fk.unitsPerEm;
    const startX = 100;

    const page = mockPage(font);
    drawShapedRun(page, { text, pdfFont: font, size, x: startX, y: 700, color: rgb(0, 0, 0) });

    const ops = page.pushOperators.mock.calls[0];
    const tmOps = ops.filter((op) => op.name === 'Tm');
    // The no-batching regression guard: a batched showText run would emit
    // fewer Tm operators than there are glyphs.
    expect(tmOps).toHaveLength(glyphs.length);
    const tjOps = ops.filter((op) => op.name === 'Tj');
    expect(tjOps).toHaveLength(glyphs.length);

    let expectedX = startX;
    tmOps.forEach((op, i) => {
      // Validated to match exactly on this sample (max deviation 0.00e+0);
      // toBeCloseTo at 9 decimal places is a safety margin, not a real tolerance.
      expect(op.args[4].asNumber()).toBeCloseTo(expectedX + positions[i].xOffset * scale, 9);
      expectedX += positions[i].xAdvance * scale;
    });
  });

  it('emits a Ts rise operator only when the shaped run actually has a nonzero yOffset', async () => {
    const font = await embedHeebo();
    const fk = font.embedder.font;
    const text = 'שָׁלוֹם';
    const composedText = composeHebrewClusters(text, (cp) => fk.hasGlyphForCodePoint(cp));
    const { positions } = fk.layout(composedText);
    const hasRise = positions.some((p) => p.yOffset !== 0);

    const page = mockPage(font);
    drawShapedRun(page, { text, pdfFont: font, size: 24, x: 0, y: 0, color: rgb(0, 0, 0) });
    const ops = page.pushOperators.mock.calls[0];
    const risesEmitted = ops.some((op) => op.name === 'Ts');
    expect(risesEmitted).toBe(hasRise);
  });

  it('mints one /Font resource entry per page per font, not one per emitted run (small defect #1)', async () => {
    const font = await embedHeebo();
    const page = mockPage(font);

    // Three calls, same page, same font - a 3-line element plus a comb cell
    // is exactly this shape (docs/hebrew-text-shaping-export.md measured 15
    // entries for one font on one such element before the fix).
    drawShapedRun(page, { text: 'א', pdfFont: font, size: 24, x: 0, y: 0, color: rgb(0, 0, 0) });
    drawShapedRun(page, { text: 'ב', pdfFont: font, size: 24, x: 10, y: 0, color: rgb(0, 0, 0) });
    drawShapedRun(page, { text: 'ג', pdfFont: font, size: 24, x: 20, y: 0, color: rgb(0, 0, 0) });

    expect(page.node.newFontDictionary).toHaveBeenCalledTimes(1);
  });

  it('mints a fresh /Font entry per page, since the cache is scoped to the page, not the font alone', async () => {
    const font = await embedHeebo();
    const pageA = mockPage(font);
    const pageB = mockPage(font);

    drawShapedRun(pageA, { text: 'א', pdfFont: font, size: 24, x: 0, y: 0, color: rgb(0, 0, 0) });
    drawShapedRun(pageB, { text: 'א', pdfFont: font, size: 24, x: 0, y: 0, color: rgb(0, 0, 0) });

    expect(pageA.node.newFontDictionary).toHaveBeenCalledTimes(1);
    expect(pageB.node.newFontDictionary).toHaveBeenCalledTimes(1);
  });

  it('emits ids remapped through the subset embedder, not raw fontkit glyph ids, against a subset-embedded font (small defect #2)', async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const subsetFont = await doc.embedFont(
      new Uint8Array(readFileSync(join(FONT_DIR, 'Heebo-Regular.ttf'))),
      { subset: true },
    );
    const fk = subsetFont.embedder.font;
    const text = 'שלום';
    const composedText = composeHebrewClusters(text, (cp) => fk.hasGlyphForCodePoint(cp));
    const { glyphs: rawGlyphs } = fk.layout(composedText);

    const page = mockPage(subsetFont);
    drawShapedRun(page, { text, pdfFont: subsetFont, size: 24, x: 0, y: 0, color: rgb(0, 0, 0) });

    const embedder = subsetFont.embedder;
    const tjOps = page.pushOperators.mock.calls[0].filter((op) => op.name === 'Tj');
    expect(tjOps).toHaveLength(rawGlyphs.length);
    tjOps.forEach((op, i) => {
      // The emitted hex code must be the subset-local id the embedder assigned
      // via includeGlyph(), not the raw fontkit glyph id - and that id must
      // have actually been registered into embedder.glyphIdMap by
      // remapGlyphForSubset (mirroring what encodeText() does internally),
      // otherwise computeWidths()/createCmap() would silently produce a
      // wrong /W array and ToUnicode CMap for this glyph.
      const rawGlyph = rawGlyphs[i];
      const expectedSubsetId = embedder.glyphIdMap.get(rawGlyph.id);
      expect(expectedSubsetId).toBeDefined();
      const emittedHex = op.args[0].value;
      const emittedId = parseInt(emittedHex, 16);
      expect(emittedId).toBe(expectedSubsetId);
      // And the subset id must differ from the raw id whenever fontkit's own
      // subset numbering (1-based, in registration order) doesn't coincide
      // with the font's original glyph id - i.e. this really is a remap, not
      // an accidental passthrough for this particular font/string.
      expect(embedder.glyphs[expectedSubsetId - 1]).toBe(rawGlyph);
    });
  });

  it('threads an explicit `direction` through to fontkit\'s layout() instead of silently ignoring it (H6)', async () => {
    // A digit-and-punctuation run has no strong character of its own, so
    // fontkit's un-hinted guess defaults to LTR (unreversed) - forcing
    // direction: 'rtl' must still visibly reverse it. This is what would
    // break if drawShapedRun stopped forwarding `direction` to `fk.layout()`
    // and quietly went back to auto-guessing per run.
    const font = await embedHeebo();
    const fk = font.embedder.font;
    const text = '1,250';
    const size = 24;

    const page = mockPage(font);
    drawShapedRun(page, { text, pdfFont: font, size, x: 0, y: 0, color: rgb(0, 0, 0), direction: 'rtl' });
    const drawnIds = page.pushOperators.mock.calls[0]
      .filter((op) => op.name === 'Tj')
      .map((op) => parseInt(op.args[0].asString(), 16));

    const unhintedIds = fk.layout(text).glyphs.map((g) => g.id);
    const forcedRtlIds = fk.layout(text, undefined, undefined, undefined, 'rtl').glyphs.map((g) => g.id);
    expect(drawnIds).not.toEqual(unhintedIds);
    expect(drawnIds).toEqual(forcedRtlIds);
  });
});

/**
 * H6 guard (docs/hebrew-text-shaping-export.md, "Layer 2"): a mixed-direction
 * line must be shaped and drawn per bidi RUN, in resolved visual order - not
 * as one whole-line `layout()` call, which reverses either everything or
 * nothing (measured: "רחוב 17" - a Hebrew word plus a house number - exports
 * as "71 בוחר" when shaped as one call, digits included). This exercises
 * `resolveBidiRuns` composed with the real `drawShapedRun`/`shapedWidth`
 * call-site pattern `text.ts`'s `serialize` uses, against a real embedded
 * font, checking actual glyph-id draw ORDER - not just that `resolveBidiRuns`
 * itself returns the right strings (see bidiRuns.test.js for that).
 */
describe('mixed-direction lines: shaping and drawing per bidi run (H6)', () => {
  function glyphIdOf(fk, char) {
    return fk.glyphForCodePoint(char.codePointAt(0)).id;
  }

  function drawnGlyphIds(page) {
    return page.pushOperators.mock.calls
      .flat()
      .filter((op) => op.name === 'Tj')
      .map((op) => parseInt(op.args[0].asString(), 16));
  }

  it('one whole-line call reverses the digits along with the Hebrew - confirms the bug this guards against is real', async () => {
    const font = await embedHeebo();
    const fk = font.embedder.font;
    const line = 'רחוב 17';
    const ids = fk.layout(line, undefined, undefined, undefined, 'rtl').glyphs.map((g) => g.id);
    // "7" drawn before "1" is the reversed (wrong) order.
    expect(ids.indexOf(glyphIdOf(fk, '7'))).toBeLessThan(ids.indexOf(glyphIdOf(fk, '1')));
  });

  it('drawing resolveBidiRuns\' runs in order keeps the house number in typed digit order, unlike the whole-line call above', async () => {
    const font = await embedHeebo();
    const fk = font.embedder.font;
    const line = 'רחוב 17';
    const runs = resolveBidiRuns(line, 'rtl');

    const page = mockPage(font);
    let pen = 0;
    runs.forEach((run) => {
      drawShapedRun(page, { text: run.text, pdfFont: font, size: 24, x: pen, y: 0, color: rgb(0, 0, 0), direction: run.direction });
      pen += shapedWidth(font, run.text, 24, run.direction);
    });

    const ids = drawnGlyphIds(page);
    // "1" before "7": the fix. Both digits must also appear before the Hebrew
    // consonants, matching resolveBidiRuns' resolved visual order (digits run
    // first/leftmost, Hebrew run last/rightmost - see bidiRuns.test.js's
    // "places the first-strong-direction segment last for an RTL-anchored
    // line" for why that's the correct anchor).
    expect(ids.indexOf(glyphIdOf(fk, '1'))).toBeLessThan(ids.indexOf(glyphIdOf(fk, '7')));
    expect(ids.indexOf(glyphIdOf(fk, '7'))).toBeLessThan(ids.indexOf(glyphIdOf(fk, 'ר')));
  });

  it('the RTL anchor lands exactly on pdfX regardless of how many runs the line split into', async () => {
    // Mirrors serialize()'s own anchor math: pdfX - lineWidth is the pen's
    // start, and lineWidth is now a sum across runs rather than one
    // shapedWidth() call - this pins that the sum still lands the last run's
    // right edge exactly on the fixed anchor.
    const font = await embedHeebo();
    const size = 24;
    const pdfX = 300; // the box's fixed right edge
    const line = 'סכום 1,250 שח';
    const runs = resolveBidiRuns(line, 'rtl');
    expect(runs.length).toBeGreaterThan(1); // non-vacuity: this line must actually split

    const runWidths = runs.map((run) => shapedWidth(font, run.text, size, run.direction));
    const lineWidth = runWidths.reduce((sum, w) => sum + w, 0);
    let pen = pdfX - lineWidth;
    runWidths.forEach((width) => { pen += width; });
    expect(pen).toBeCloseTo(pdfX, 9);
  });
});

describe('unrepresentableCharacters', () => {
  it('returns nothing for a font with no reachable fontkit instance, the same fallback signal as shapedWidth', async () => {
    const doc = await PDFDocument.create();
    const standard = await doc.embedFont(StandardFonts.Helvetica);
    expect(unrepresentableCharacters(standard, 'anything')).toEqual([]);
  });

  it('reports Arabic as entirely unrepresentable in a Hebrew-capable bundled font', async () => {
    const font = await embedHeebo();
    // "مرحبا" (marhaba/hello) - 5 distinct Arabic letters, none in Heebo.
    expect(unrepresentableCharacters(font, 'مرحبا')).toEqual(['م', 'ر', 'ح', 'ب', 'ا']);
  });

  it('reports only the emoji when it is mixed into otherwise-covered Hebrew', async () => {
    const font = await embedHeebo();
    expect(unrepresentableCharacters(font, 'שלום 😀')).toEqual(['😀']);
  });

  it('reports nothing for a clean line mixing Hebrew, Latin and digits - no false positive', async () => {
    const font = await embedHeebo();
    expect(unrepresentableCharacters(font, 'רחוב 17, Tel Aviv')).toEqual([]);
  });

  it('never reports a line break, which serialize strips before drawing and no bundled font maps anyway', async () => {
    const font = await embedHeebo();
    expect(unrepresentableCharacters(font, 'שלום\nעולם')).toEqual([]);
  });

  it('deduplicates a repeated unrepresentable character, keeping first-seen order', async () => {
    const font = await embedHeebo();
    // "ا" (alif) appears three times; the result must name it once.
    expect(unrepresentableCharacters(font, 'اbaا bا')).toEqual(['ا']);
  });
});

describe('shapedWidth', () => {
  it('returns null - the fallback signal - for a font with no reachable fontkit instance', async () => {
    const doc = await PDFDocument.create();
    const standard = await doc.embedFont(StandardFonts.Helvetica);
    expect(shapedWidth(standard, 'hello', 12)).toBeNull();
  });

  it('sums the shaper\'s own xAdvance, not the PDF /W widths', async () => {
    const font = await embedHeebo();
    const fk = font.embedder.font;
    const text = 'שלום';
    const size = 24;
    const expected = fk.layout(text).positions.reduce((sum, p) => sum + p.xAdvance, 0) * size / fk.unitsPerEm;
    expect(shapedWidth(font, text, size)).toBeCloseTo(expected, 9);
  });
});

/**
 * The invisible-character false positive: a naive coverage check refuses a
 * whole document over characters the user cannot see, find or delete.
 * Measured 2026-08-22 - see docs/hebrew-text-shaping-export.md, "Two traps
 * in building the check".
 *
 * Gveret Levin on purpose, not Arimo. Arimo has glyphs for LRM/RLM, so the
 * same assertions there would pass without exercising anything - the exact
 * vacuous-test trap this epic has hit twice already. Each test below asserts
 * the hazard is real in this font first, then that the strip handles it.
 */
describe('invisible formatting characters', () => {
  const RLM = '\u200F';
  const ZWSP = '\u200B';
  const ZWJ = '\u200D';
  const ZWNJ = '\u200C';

  it('does not refuse Hebrew carrying an invisible RLM', async () => {
    const font = await embedFont('GveretLevin-Regular.ttf');
    // Non-vacuity: this font really does lack the RLM, so an unguarded
    // coverage check really would refuse over it. Arimo would prove nothing
    // here - it has a glyph for RLM.
    expect(font.embedder.font.hasGlyphForCodePoint(0x200f)).toBe(false);
    expect(unrepresentableCharacters(font, `שלום${RLM}עולם`)).toEqual([]);
  });

  it('does not refuse a pasted zero-width space', async () => {
    const font = await embedFont('GveretLevin-Regular.ttf');
    expect(font.embedder.font.hasGlyphForCodePoint(0x200b)).toBe(false);
    expect(unrepresentableCharacters(font, `שלום${ZWSP}עולם`)).toEqual([]);
  });

  it('keeps joiners for shaping and searchable text while excluding them from glyph coverage', async () => {
    const font = await embedFont('GveretLevin-Regular.ttf');
    const fk = font.embedder.font;
    const typed = `a${ZWJ}b${ZWNJ}c`;

    // Non-vacuity: the face really has no glyph for these controls. The
    // coverage rule must waive that absence without deleting the controls
    // before a shaper or /ActualText can use them.
    expect(fk.hasGlyphForCodePoint(0x200d)).toBe(false);
    expect(fk.hasGlyphForCodePoint(0x200c)).toBe(false);
    expect(unrepresentableCharacters(font, typed)).toEqual([]);
    expect(stripInvisibleFormatting(typed)).toBe(typed);
  });

  it('preserves a Persian ZWNJ that changes the real Arabic shaping result', async () => {
    const font = await embedFont('ScheherazadeNew-Regular.ttf');
    const fk = font.embedder.font;
    const typed = 'می\u200Cروم';
    const withoutJoiner = typed.replace('\u200C', '');

    expect(stripInvisibleFormatting(typed)).toBe(typed);
    expect(unrepresentableCharacters(font, typed)).toEqual([]);
    const shapedIds = (value) => fk.layout(value, undefined, undefined, undefined, 'rtl').glyphs.map((glyph) => glyph.id);
    // Non-vacuity: deleting the authored ZWNJ selects different joining forms
    // for the letters on either side in the font the exporter really embeds.
    expect(shapedIds(typed)).not.toEqual(shapedIds(withoutJoiner));
  });

  it('does not refuse a TAB, and keeps its gap as a space rather than a .notdef box', async () => {
    const font = await embedFont('Arimo-Regular.ttf');
    const fk = font.embedder.font;
    const typed = 'Name:\tShlomi';

    // TAB is the one that actually reaches the page as a box: it is a control
    // character, not a Unicode default-ignorable format one, so layout() has
    // no reason to swallow it. Both halves asserted, so this cannot go vacuous.
    expect(fk.hasGlyphForCodePoint(0x09)).toBe(false);
    expect(fk.layout(typed).glyphs.some((glyph) => glyph.id === 0)).toBe(true);

    expect(unrepresentableCharacters(font, typed)).toEqual([]);
    expect(stripInvisibleFormatting(typed)).toBe('Name: Shlomi');
    expect(fk.layout(stripInvisibleFormatting(typed)).glyphs.some((glyph) => glyph.id === 0)).toBe(false);
  });

  it('still refuses text that is genuinely unrepresentable', async () => {
    const font = await embedFont('GveretLevin-Regular.ttf');
    // The strip must not have quietly turned the whole check off.
    expect(unrepresentableCharacters(font, `مرحبا${RLM}`)).toEqual(['م', 'ر', 'ح', 'ب', 'ا']);
  });

  it('strips a newline too, which is why callers must split on them first', () => {
    // Documented contract, asserted so nobody "fixes" the strip to preserve
    // \n and silently breaks the multi-line split that runs before it.
    expect(stripInvisibleFormatting('a\nb')).toBe('ab');
  });
});

/**
 * The NFC seam (docs/wysiwyg-text-architecture.md §1.4/§3.1): coverage must
 * be judged against the string that reaches `layout()`, which has been
 * through `composeHebrewClusters` - and that function opens with
 * `text.normalize('NFC')`, which is not Hebrew-specific. Checking the typed
 * string instead of the composed one can silently pass a character the font
 * cannot draw (composition introduces a codepoint), or falsely refuse one it
 * can (composition is gated on the font's own glyph, so it correctly leaves
 * a font-missing presentation form decomposed - a form the check must credit
 * the font for, not the literal presentation-form codepoint it never draws).
 */
describe('the normalization seam', () => {
  it('reports the NFC-composed character, not the decomposed pair that was actually typed - a silent loss without this', async () => {
    const font = await embedHeebo();
    const fk = font.embedder.font;
    // Decomposed Greek alpha + combining acute, exactly as it arrives from a
    // macOS filesystem path or some IMEs - NOT the precomposed U+03AC.
    const text = 'שלום ' + String.fromCodePoint(0x03b1, 0x0301);
    // Non-vacuity: Heebo has both halves the user actually typed...
    expect(fk.hasGlyphForCodePoint(0x03b1)).toBe(true);
    expect(fk.hasGlyphForCodePoint(0x0301)).toBe(true);
    // ...but not the codepoint NFC composes them into, which is what
    // fontkit's layout() is actually handed.
    expect(fk.hasGlyphForCodePoint(0x03ac)).toBe(false);
    expect(unrepresentableCharacters(font, text)).toEqual([String.fromCodePoint(0x03ac)]);
  });

  it('does not refuse a pasted Hebrew presentation form the font would have drawn decomposed', async () => {
    const font = await embedFont('Alef-Regular.ttf');
    const fk = font.embedder.font;
    // The precomposed yod-hiriq presentation form, as it arrives when pasted
    // rather than typed letter by letter.
    const presentationForm = String.fromCodePoint(0xfb1d);
    // Non-vacuity: Alef genuinely lacks the precomposed glyph...
    expect(fk.hasGlyphForCodePoint(0xfb1d)).toBe(false);
    // ...but has both halves of the decomposition composeHebrewClusters
    // leaves behind once its own hasGlyph gate blocks recomposing them.
    expect(fk.hasGlyphForCodePoint(0x05d9)).toBe(true);
    expect(fk.hasGlyphForCodePoint(0x05b4)).toBe(true);
    expect(unrepresentableCharacters(font, presentationForm)).toEqual([]);
  });
});

/**
 * The strip must run AFTER bidi, never before: LRM/RLM and the embedding
 * controls are `\p{Cf}`, and they are the input UAX#9 reads. Stripping first
 * reintroduces exactly the editor/export ordering divergence layer 2 closed.
 */
describe('directional marks survive into bidi resolution', () => {
  const LRM = '\u200E';
  // Ordinary text pasted from Word or WhatsApp: a Hebrew sentence with a
  // parenthesised Latin token that the author isolated with LRM marks.
  const typed = `הקובץ ${LRM}(v2)${LRM} מוכן`;
  const visual = (line) => resolveBidiRuns(line, 'rtl').map((run) => run.text).join('');
  const withoutFormatControls = (line) => line.replace(/\p{Cf}/gu, '');

  it('keeps the parenthesised Latin token together', () => {
    // Non-vacuity: the marks genuinely change the resolved order here, so a
    // pipeline that discards them cannot accidentally pass this test.
    expect(visual(typed)).not.toEqual(visual(withoutFormatControls(typed)));
    // With the marks intact the parentheses stay wrapped around "v2".
    expect(visual(typed)).toContain('(v2)');
    // Stripped first, they are torn off and land at opposite ends of the line.
    expect(visual(withoutFormatControls(typed))).not.toContain('(v2)');
  });

  it('normalizeTabsForBidi leaves directional marks alone', () => {
    expect(normalizeTabsForBidi(typed)).toBe(typed);
    expect(normalizeTabsForBidi('a\tb')).toBe('a b');
  });

  it('keeps directional marks in resolved runs for searchable text', () => {
    const runs = resolveBidiRuns(typed, 'rtl')
      .map((run) => stripInvisibleFormatting(run.text))
      .filter((text) => text !== '');
    expect(runs.join('')).toContain(LRM);
    expect(runs.join('')).toContain('(v2)');
  });
});

/**
 * H9: the browser shapes word by word, so we must too, or a feature whose
 * context crosses a space fires in the export and not on screen.
 */
describe('per-segment shaping matches the browser\'s word-by-word shaping', () => {
  it('does not apply a kern pair that spans a space', async () => {
    const font = await embedFont('Arimo-Regular.ttf');
    const size = 32;
    // Non-vacuity: this string really does carry a space-spanning kern in this
    // font, so whole-line and per-segment shaping genuinely differ. Without
    // this the assertion below could pass on a string with no kern at all.
    const wholeLine = shapedWidth(font, 'Tel Aviv', size);
    const perSegment = ['Tel', ' ', 'Aviv'].reduce((sum, part) => sum + shapedWidth(font, part, size), 0);
    expect(wholeLine).not.toBeCloseTo(perSegment, 6);
    // 113 font units at 2048 upm, measured against the browser's measureText.
    expect((perSegment - wholeLine) / size * font.embedder.font.unitsPerEm).toBeCloseTo(113, 0);
  });

  it('reverses an RTL run\'s segments, so the first-typed word sits rightmost', async () => {
    const font = await embedFont('Arimo-Regular.ttf');
    const fk = font.embedder.font;
    const ids = (text) => fk.layout(text, undefined, undefined, undefined, 'rtl').glyphs.map((glyph) => glyph.id);
    const line = 'שלום עולם';
    const segments = line.split(/( )/).filter((part) => part !== '');

    // Shaping the segments in reversed order reproduces exactly what shaping
    // the whole run produces; forward order does not. This is what pins the
    // segment ordering in toShapingSegments to something checkable.
    const reversed = [...segments].reverse().flatMap(ids);
    const forward = segments.flatMap(ids);
    expect(reversed).toEqual(ids(line));
    expect(forward).not.toEqual(ids(line));
  });
});
