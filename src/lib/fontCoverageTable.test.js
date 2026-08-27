/**
 * Drift guard for src/lib/fontCoverageTable.js, the generated per-file glyph
 * coverage table that W3's coverage-based font resolver will read from
 * (docs/wysiwyg-text-architecture.md §3.1/§3.2/§3.4).
 *
 * A generated file that has quietly gone stale relative to the real font
 * bytes is the one failure mode this whole approach lives or dies on: the
 * resolver would make silently wrong decisions and nothing would say why.
 * So this regenerates the table in memory from public/fonts/ on every run
 * and asserts it is byte-for-byte the committed module - the same shape of
 * check src/lib/fontCoverage.test.js already runs for HEBREW_CAPABLE_FONTS
 * and SCRIPT_FALLBACKS, just against the new table instead of a hand-written
 * list.
 *
 * It also proves, rather than assumes, that fontkit's two coverage APIs
 * agree (characterSet, which the generator uses because it is cheap to
 * enumerate, and hasGlyphForCodePoint, which is what a per-character lookup
 * would call at runtime) - and it carries a non-vacuity half, in the same
 * spirit as fontCoverage.test.js's SCRIPT_FALLBACKS checks: real codepoints
 * a font genuinely lacks must come back false, not just real codepoints it
 * has come back true. A table that always said "covered" would pass every
 * positive assertion here and be useless.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { FONT_COVERAGE, FONT_COVERAGE_FILES, fontFileHasGlyph } from './fontCoverageTable.js';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');

function toRanges(codePoints) {
  const sorted = [...codePoints].sort((a, b) => a - b);
  const ranges = [];
  for (const cp of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && cp === last[1] + 1) {
      last[1] = cp;
    } else {
      ranges.push([cp, cp]);
    }
  }
  return ranges;
}

const realFontFiles = readdirSync(FONT_DIR).filter((name) => name.endsWith('.ttf')).sort();

/** One fontkit instance per real file, reused across every describe block below. */
const realFonts = Object.fromEntries(
  realFontFiles.map((file) => [file, fontkit.create(readFileSync(join(FONT_DIR, file)))]),
);

describe('fontCoverageTable is not stale', () => {
  it('covers exactly the .ttf files present in public/fonts/, no more and no fewer', () => {
    expect([...FONT_COVERAGE_FILES].sort()).toEqual(realFontFiles);
  });

  it('matches a fresh range-encoding of every font file exactly - if this fails, run npm run generate:font-coverage and commit the result', () => {
    const freshTable = {};
    for (const file of realFontFiles) {
      const font = realFonts[file];
      // Mirrors the generator's own filter: characterSet alone is not the
      // same claim as hasGlyphForCodePoint (every bundled font's
      // characterSet includes U+FFFF, a reserved noncharacter cmap sentinel,
      // which hasGlyphForCodePoint correctly rejects) - see the
      // "fontFileHasGlyph agrees with fontkit" and non-vacuity blocks below
      // for the assertions that prove this rather than assume it.
      const covered = font.characterSet.filter((cp) => font.hasGlyphForCodePoint(cp));
      freshTable[file] = toRanges(covered);
    }
    expect(FONT_COVERAGE).toEqual(freshTable);
  });
});

describe('fontFileHasGlyph agrees with fontkit on every font it covers', () => {
  it.each(realFontFiles)('%s: every codepoint hasGlyphForCodePoint confirms reads true from the table too', (file) => {
    const font = realFonts[file];
    // Filtered through hasGlyphForCodePoint, not raw characterSet: every
    // bundled font's characterSet includes U+FFFF (a reserved Unicode
    // noncharacter, present as a cmap sentinel) while hasGlyphForCodePoint
    // correctly says false for it - a real, measured disagreement, which is
    // exactly why this suite exists instead of assuming the two APIs agree.
    // Sampling the full covered set would be slow across 32 files with
    // thousands of codepoints each (Arimo alone has 3,011); a fixed stride
    // still exercises the full spread of the font's coverage, including its
    // block boundaries, without turning this suite into the slow one.
    const codePoints = font.characterSet.filter((cp) => font.hasGlyphForCodePoint(cp));
    const stride = Math.max(1, Math.floor(codePoints.length / 200));
    for (let i = 0; i < codePoints.length; i += stride) {
      const cp = codePoints[i];
      expect(fontFileHasGlyph(file, cp)).toBe(true);
      expect(font.hasGlyphForCodePoint(cp)).toBe(true);
    }
  });

  it.each(realFontFiles)('%s: characterSet U+FFFF sentinel is correctly excluded (the one real characterSet/hasGlyphForCodePoint disagreement)', (file) => {
    const font = realFonts[file];
    if (!font.characterSet.includes(0xffff)) return; // not every font necessarily carries the sentinel
    expect(font.hasGlyphForCodePoint(0xffff)).toBe(false);
    expect(fontFileHasGlyph(file, 0xffff)).toBe(false);
  });
});

describe('non-vacuity: the table says false for codepoints a font genuinely lacks', () => {
  // Real absences, checked against a font that has no business drawing them -
  // mirrors fontCoverage.test.js's SCRIPT_FALLBACKS non-vacuity check, which
  // exists for exactly the same reason: a one-way "does covered codepoint
  // read true" check would also pass for a table that returned true for
  // everything.
  const HEBREW_ALEF = 0x05d0; // א
  const ARABIC_ALEF = 0x0627; // ا
  const CJK_SAMPLE = 0x4e2d; // 中
  const EMOJI_SAMPLE = 0x1f600; // 😀

  const cases = [
    { file: 'Pacifico-Regular.ttf', codePoint: HEBREW_ALEF, label: 'Hebrew alef in Pacifico (Latin-only handwriting face)' },
    { file: 'Arimo-Regular.ttf', codePoint: ARABIC_ALEF, label: 'Arabic alef in Arimo (no Arabic coverage)' },
    { file: 'Arimo-Regular.ttf', codePoint: CJK_SAMPLE, label: 'CJK ideograph in Arimo' },
    { file: 'Almarai-Regular.ttf', codePoint: CJK_SAMPLE, label: 'CJK ideograph in Almarai' },
    { file: 'Arimo-Regular.ttf', codePoint: EMOJI_SAMPLE, label: 'emoji in Arimo' },
    { file: 'Heebo-Regular.ttf', codePoint: EMOJI_SAMPLE, label: 'emoji in Heebo' },
    { file: 'Assistant-Regular.ttf', codePoint: ARABIC_ALEF, label: 'Arabic alef in Assistant (Hebrew-capable, not Arabic-capable)' },
  ];

  it.each(cases)('$label: real font agrees it has no glyph, and the table says false too', ({ file, codePoint }) => {
    expect(realFonts[file].hasGlyphForCodePoint(codePoint)).toBe(false);
    expect(fontFileHasGlyph(file, codePoint)).toBe(false);
  });

  it('a filename the table has no data for reads false rather than throwing', () => {
    expect(fontFileHasGlyph('NotAFile-Regular.ttf', 0x41)).toBe(false);
  });
});
