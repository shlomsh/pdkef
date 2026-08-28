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
 * The table is a hybrid encoding (ranges, plus a base64 bitmap for a block
 * where ranges are pathological - see the generated file's header), so this
 * re-derives both halves here rather than importing the generator's own
 * encoder: a guard that reuses the code it is guarding cannot notice the
 * encoder and the reader disagreeing. The bitmap-encoded block additionally
 * gets an exhaustive, every-codepoint check against fontkit below, because a
 * single flipped bit is one character that silently starts rendering as
 * .notdef or starts being wrongly refused while typing.
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
import {
  COVERAGE_BITMAP_BLOCKS,
  FONT_COVERAGE,
  FONT_COVERAGE_BITMAPS,
  FONT_COVERAGE_FILES,
  fontFileHasGlyph,
} from './fontCoverageTable.js';

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

function formatRanges(ranges) {
  return `[${ranges.map(([a, b]) => `[${a},${b}]`).join(',')}]`;
}

function toBitmap(codePoints, start, end) {
  const bytes = Buffer.alloc(Math.ceil((end - start + 1) / 8));
  for (const cp of codePoints) {
    if (cp < start || cp > end) continue;
    const bit = cp - start;
    bytes[bit >> 3] |= 1 << (bit & 7);
  }
  return bytes.toString('base64');
}

/**
 * Mirrors the generator's chooseEncoding(): for every candidate block, encode
 * it both ways and keep the shorter source text, moving those codepoints out
 * of the range list when the bitmap wins.
 */
function encodeCoverage(covered) {
  const bitmaps = [];
  let remaining = covered;
  for (const [start, end] of COVERAGE_BITMAP_BLOCKS) {
    const inBlock = remaining.filter((cp) => cp >= start && cp <= end);
    const asRanges = formatRanges(toRanges(inBlock));
    const asBitmap = toBitmap(inBlock, start, end);
    if (asBitmap.length + 2 < asRanges.length) {
      bitmaps.push(asBitmap);
      remaining = remaining.filter((cp) => cp < start || cp > end);
    } else {
      bitmaps.push(null);
    }
  }
  return {
    ranges: toRanges(remaining),
    bitmaps: bitmaps.some((b) => b !== null) ? bitmaps : null,
  };
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

  it('matches a fresh encoding of every font file exactly - if this fails, run npm run generate:font-coverage and commit the result', () => {
    const freshTable = {};
    const freshBitmaps = {};
    for (const file of realFontFiles) {
      const font = realFonts[file];
      // Mirrors the generator's own filter: characterSet alone is not the
      // same claim as hasGlyphForCodePoint (every bundled font's
      // characterSet includes U+FFFF, a reserved noncharacter cmap sentinel,
      // which hasGlyphForCodePoint correctly rejects) - see the
      // "fontFileHasGlyph agrees with fontkit" and non-vacuity blocks below
      // for the assertions that prove this rather than assume it.
      const covered = font.characterSet.filter((cp) => font.hasGlyphForCodePoint(cp));
      const encoded = encodeCoverage(covered);
      freshTable[file] = encoded.ranges;
      if (encoded.bitmaps) freshBitmaps[file] = encoded.bitmaps;
    }
    expect(FONT_COVERAGE).toEqual(freshTable);
    expect(FONT_COVERAGE_BITMAPS).toEqual(freshBitmaps);
  });

  it('never has a file whose ranges overlap a block its own bitmap owns', () => {
    for (const [file, bitmaps] of Object.entries(FONT_COVERAGE_BITMAPS)) {
      bitmaps.forEach((base64, i) => {
        if (!base64) return;
        const [start, end] = COVERAGE_BITMAP_BLOCKS[i];
        for (const [rangeStart, rangeEnd] of FONT_COVERAGE[file]) {
          expect(rangeStart > end || rangeEnd < start).toBe(true);
        }
      });
    }
  });

  it('bitmap-encodes some block for at least one file, so the bitmap path is actually exercised', () => {
    // Non-vacuity for every bitmap assertion in this file: if the encoder ever
    // stopped choosing a bitmap, the checks above would all pass trivially
    // against two empty objects.
    expect(Object.keys(FONT_COVERAGE_BITMAPS).length).toBeGreaterThan(0);
  });
});

describe('bitmap-encoded blocks agree with fontkit on every codepoint, not a sample', () => {
  const bitmapFiles = Object.keys(FONT_COVERAGE_BITMAPS);

  it.each(bitmapFiles)('%s: every codepoint of every bitmap-encoded block matches hasGlyphForCodePoint', (file) => {
    const font = realFonts[file];
    FONT_COVERAGE_BITMAPS[file].forEach((base64, i) => {
      if (!base64) return;
      const [start, end] = COVERAGE_BITMAP_BLOCKS[i];
      let covered = 0;
      for (let cp = start; cp <= end; cp += 1) {
        const expected = font.hasGlyphForCodePoint(cp);
        if (expected) covered += 1;
        expect(fontFileHasGlyph(file, cp)).toBe(expected);
      }
      // Both directions have to be non-empty or the loop above proves nothing:
      // an all-zero bitmap would satisfy it for a font with no Han at all.
      expect(covered).toBeGreaterThan(0);
      expect(covered).toBeLessThan(end - start + 1);
    });
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
