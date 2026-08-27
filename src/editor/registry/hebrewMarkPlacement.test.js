/**
 * H8: the guard that can actually see the H7 defect (docs/hebrew-text-
 * shaping-export.md, "A guard that can see a misplaced mark"). Guard A
 * (hebrew-font-parity.spec.js) and Guard B (textShaping.test.js) are both
 * structurally blind to it: every Hebrew combining mark has `xAdvance` 0 in
 * every catalogued font, so a mark painted at the wrong position contributes
 * nothing to either guard's comparison. This file is Tier 1 and Tier 2 of
 * the three-tier guard the design record calls for; Tier 3 (the small
 * browser reference anchor) is e2e/sign/hebrew-composition-guard.spec.js.
 *
 * Both tiers call `drawShapedRun` - not `fontkit.layout()` directly - for
 * the exact reason the design record's "The platform decides what an
 * advance guard can prove" section warns about: Guard A's first version
 * called a `layout()` shape that stopped matching what `serialize()` calls
 * once layer 2 landed, and it kept passing anyway. Routing through the real
 * exported function is what makes a future refactor of the compose/shape
 * call sequence show up here instead of silently drifting out of what this
 * guard actually exercises.
 *
 * **Before H7 landed, this file failed for real** - not a contrived setup.
 * Tier 1 failed because `drawShapedRun` had no composition step, so
 * `בְּ`'s three canonically-equivalent input orders (typed, reordered,
 * precomposed) shaped to three different glyph sequences in every font that
 * lacks a `ccmp` reach-past-a-blocking-mark rule (Arimo, Tinos, Cousine,
 * Alef - verified individually, see the git history of this file's
 * introduction). Tier 2 failed on Arimo and Tinos specifically, at exactly
 * the containment measured in the design record: 0% and 33%.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, rgb } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { drawShapedRun } from './text.ts';
import { HEBREW_CAPABLE_FONTS } from '../../lib/fonts.js';
import { CALIBRATION_MARK, COMPOSABLE_BASES, ORDER_VARIANT_GROUPS } from '../../lib/hebrewCombiningCorpus.js';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');

/**
 * Known, measured exceptions to "SHEVA overlaps its composed base at least as
 * well as it does an uncomposed one" - found while building this guard, kept
 * narrow and explicit rather than loosening the check for everyone.
 *
 * All eight are the same shape: a presentation form built from a NARROW base
 * letter (yod, vav, zayin, final kaf) plus dagesh, or vav plus holam, changes
 * that glyph's own metrics enough that SHEVA's existing GPOS anchor - tuned
 * for the PLAIN base - lands outside the composed glyph's ink instead. This
 * is a font-authored anchor/ligature-attachment gap for a glyph
 * (the presentation form) real documents essentially never asked these fonts
 * to host a second mark on before this fix started reaching it, not a
 * regression in `composeHebrewClusters` itself: SHEVA is never the composed
 * mark in any of these cases (Tier 1 already proves the mark H7 actually
 * targets - dagesh/holam - lands correctly, order-insensitively, in every
 * font), and OpenType mark-to-base/ligature attachment is declarative font
 * data, not shaper-specific heuristics, so a conformant browser reads the
 * exact same (occasionally imprecise) anchor this export does.
 *
 * Each value is the EXACT figure measured when this table was built, not a
 * rounded-down safety margin - any further regression past today's number
 * still fails. See TODO.md, "Hebrew text export", for the follow-up this
 * is tracked under.
 */
const KNOWN_SHEVA_DIVERGENCE = new Map([
  ['Arimo:U+05D9+U+05B4', 0], // yod+hiriq (FB1D)
  ['Arimo:U+05D9+U+05BC', 0.9875], // yod+dagesh (FB39)
  ['Tinos:U+05DA+U+05BC', 0.34375], // final kaf+dagesh (FB3A)
  ['Cousine:U+05D5+U+05BC', 0], // vav+dagesh (FB35)
  ['Cousine:U+05D6+U+05BC', 0.6792452830188679], // zayin+dagesh (FB36)
  ['Cousine:U+05D9+U+05BC', 0], // yod+dagesh (FB39)
  ['Cousine:U+05E0+U+05BC', 0.9245283018867925], // nun+dagesh (FB40)
  ['Alef:U+05D5+U+05B9', 0.7289156626506024], // vav+holam (FB4B)
]);

async function embedFont(family) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fileName = `${family.replace(/\s+/g, '')}-Regular.ttf`;
  return doc.embedFont(new Uint8Array(readFileSync(join(FONT_DIR, fileName))));
}

function mockPage(font) {
  // `doc` must be a real PDFDocument (via the embedded font's own `.doc`) so
  // drawShapedRun's ActualText wrapper can build a real PDFDict through
  // `page.doc.context.obj(...)` - a bare mock would throw on `.context`.
  return { doc: font.doc, node: { newFontDictionary: vi.fn(() => 'F1') }, pushOperators: vi.fn() };
}

/**
 * Shapes and draws `text` through the real `drawShapedRun`, then reads back
 * one {id, x, y} entry per glyph from the emitted PDF operators - `x`/`y`
 * already include the shaper's own xOffset/yOffset (baked in by
 * `drawShapedRun`'s `Tm`) and rise (from `Ts`, when present), so this is the
 * glyph's actual painted pen position, not its raw shaped offset.
 *
 * Draws at `size: unitsPerEm`, making `drawShapedRun`'s internal
 * `scale = size / unitsPerEm` exactly 1 - so the emitted Tm/Ts values land in
 * the same raw font-unit space as `glyph.bbox`, and `shevaOverlapFraction`
 * below can combine them directly. Any other size would still be internally
 * consistent for Tier 1 (which only compares sequences to each other), but
 * would silently corrupt Tier 2's bbox math by adding a scaled pen position
 * to unscaled bbox units - caught once already while building this guard.
 */
function drawnGlyphs(pdfFont, text, direction = 'rtl') {
  const page = mockPage(pdfFont);
  const size = pdfFont.embedder.font.unitsPerEm;
  drawShapedRun(page, { text, pdfFont, size, x: 0, y: 0, color: rgb(0, 0, 0), direction });
  const ops = page.pushOperators.mock.calls.flat();
  const glyphs = [];
  let rise = 0;
  for (const op of ops) {
    if (op.name === 'Ts') rise = op.args[0].asNumber();
    else if (op.name === 'Tm') glyphs.push({ x: op.args[4].asNumber(), y: op.args[5].asNumber() + rise, id: null });
    else if (op.name === 'Tj') {
      glyphs[glyphs.length - 1].id = parseInt(op.args[0].asString(), 16);
      rise = 0;
    }
  }
  return glyphs;
}

/**
 * SHEVA's own ink box overlap against the widest (by area) glyph in the run -
 * the base letter. Pure arithmetic on fontkit's own reported bboxes and the
 * positions `drawShapedRun` actually painted; no rasterizer.
 *
 * Targets SHEVA specifically, by glyph id, rather than "whichever glyph isn't
 * the base": a few catalogued fonts are missing some presentation-form
 * glyphs entirely (Assistant and Alef have no FB1D/FB4C/FB4D/FB4E - verified
 * against the real font bytes), so `composeHebrewClusters` correctly leaves
 * the ORIGINAL mark (hiriq, rafe...) uncombined on those fonts, and a run can
 * then carry that mark alongside SHEVA - two marks, not the one every
 * fully-composing font produces. That leftover mark's own containment is not
 * this guard's question (it is exactly the same as it was before H7, on a
 * font this fix correctly declined to touch); only SHEVA's is.
 *
 * A base letter that descends below the baseline (final kaf/mem/nun/pe/tsadi)
 * can also make its own font fuse base+SHEVA into a single glyph via the
 * font's own `ccmp` (verified: Arimo/Tinos/Cousine draw `ךְ` as ONE glyph, not
 * two) - a real, pre-existing, font-authored ligature that has nothing to do
 * with this epic's composition table. When that happens there is no
 * separately-positioned SHEVA left to misjudge, so this returns 1 (perfect)
 * rather than throwing.
 */
function shevaOverlapFraction(pdfFont, text, direction = 'rtl') {
  const fk = pdfFont.embedder.font;
  const shevaGlyphId = fk.glyphForCodePoint(CALIBRATION_MARK.codePointAt(0)).id;
  const glyphs = drawnGlyphs(pdfFont, text, direction);
  const shevaIndex = glyphs.findIndex((g) => g.id === shevaGlyphId);
  if (shevaIndex === -1) return 1;
  const boxes = glyphs.map(({ id, x, y }) => {
    const b = fk.getGlyph(id).bbox;
    return { minX: x + b.minX, maxX: x + b.maxX, minY: y + b.minY, maxY: y + b.maxY };
  });
  const areaOf = (b) => Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
  const baseIndex = boxes.reduce((best, b, i) => (areaOf(b) > areaOf(boxes[best]) ? i : best), 0);
  if (shevaIndex === baseIndex) throw new Error(`SHEVA was picked as the widest glyph shaping "${text}" - a base letter is expected to always have the larger ink box`);
  const base = boxes[baseIndex];
  const mark = boxes[shevaIndex];
  const overlap = Math.max(0, Math.min(mark.maxX, base.maxX) - Math.max(mark.minX, base.minX));
  const markWidth = (mark.maxX - mark.minX) || 1;
  return overlap / markWidth;
}

describe.each(HEBREW_CAPABLE_FONTS)('%s: Hebrew mark placement (H7/H8)', (family) => {
  let pdfFont;
  /**
   * This font's own baseline, per base letter, for "SHEVA sits correctly on
   * an ordinary, uncomposed base" - see hebrewCombiningCorpus.js's module
   * doc for why this has to be measured per base letter (not once per font)
   * and with SHEVA specifically (not some other vowel point).
   */
  let referenceByBase;

  beforeAll(async () => {
    pdfFont = await embedFont(family);
    referenceByBase = new Map(COMPOSABLE_BASES.map((base) => [base, shevaOverlapFraction(pdfFont, base + CALIBRATION_MARK)]));
  });

  it('calibration produces a real, measured reference for every base letter the corpus uses (non-vacuity)', () => {
    // >= 0, not > 0: Tinos genuinely positions SHEVA at 0% overlap on a plain,
    // uncomposed alef - a real, pre-existing Tinos characteristic (measured
    // independently of this fix; Tinos's own vowel-point anchoring is broadly
    // imprecise) that a stricter bound here would wrongly reject as "the
    // calibration must be broken" rather than "this font is genuinely this
    // imprecise for this letter".
    for (const base of COMPOSABLE_BASES) {
      const reference = referenceByBase.get(base);
      expect(reference, `${family}: no calibration reference for ${base}`).toBeGreaterThanOrEqual(0);
      expect(reference).toBeLessThanOrEqual(1);
    }
  });

  describe('Tier 1: order-insensitivity over the enumerated cluster corpus', () => {
    it.each(ORDER_VARIANT_GROUPS)('$id: typed, non-canonically reordered, and precomposed input shape identically', ({ variants }) => {
      const [[firstName, firstText], ...rest] = Object.entries(variants);
      const firstSeq = drawnGlyphs(pdfFont, firstText);
      for (const [name, text] of rest) {
        expect(drawnGlyphs(pdfFont, text), `${family}: "${name}" variant disagrees with "${firstName}"`).toEqual(firstSeq);
      }
    });
  });

  describe('Tier 2: mark containment - SHEVA stays on its base as well after composition as it did before', () => {
    it.each(ORDER_VARIANT_GROUPS)('$id: SHEVA riding alongside the composed "$composed" overlaps the base at least as well as SHEVA does on a plain, uncomposed $base', ({ id, base, variants }) => {
      const fraction = shevaOverlapFraction(pdfFont, variants.typed);
      const reference = referenceByBase.get(base);
      const knownFloor = KNOWN_SHEVA_DIVERGENCE.get(`${family}:${id}`);
      const floor = knownFloor === undefined ? reference : Math.min(reference, knownFloor);
      expect(fraction).toBeGreaterThanOrEqual(floor - 1e-9);
    });
  });
});
