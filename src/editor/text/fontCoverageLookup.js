/**
 * Runtime reader for src/editor/text/fontCoverageTable.js's generated coverage
 * data. Hand-written source, kept separate from the generated table itself so
 * that file can stay data-only (ARCH-22): the generator (scripts/generate-
 * font-coverage.mjs) only ever needs to emit FONT_COVERAGE / COVERAGE_BITMAP_BLOCKS
 * / FONT_COVERAGE_BITMAPS / FONT_COVERAGE_FILES, never this lookup logic.
 *
 * fonts.js (the editor and exporter's shared resolver) and
 * generate-font-coverage-report.mjs both import fontFileHasGlyph from here.
 */
import {
  COVERAGE_BITMAP_BLOCKS,
  FONT_COVERAGE,
  FONT_COVERAGE_BITMAPS,
} from './fontCoverageTable.js';

/**
 * Binary search over one file's range list. Ranges are sorted and
 * non-overlapping (guaranteed by toRanges() in the generator), so this is
 * O(log ranges) per call and never expands into a Set - the whole point of
 * range-encoding is to avoid materializing thousands of codepoints per font
 * just to answer "is this one glyph present".
 */
function rangesHaveCodePoint(ranges, codePoint) {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [start, end] = ranges[mid];
    if (codePoint < start) high = mid - 1;
    else if (codePoint > end) low = mid + 1;
    else return true;
  }
  return false;
}

/** @type {Map<string, Uint8Array>} */
const bitmapCache = new Map();

/**
 * base64 -> bytes, memoized per distinct bitmap. The cache is what keeps a
 * bit test cheap without decoding anything a session never asks about: a
 * Latin-only session never touches a Han bitmap at all, and a session that
 * does pays 3,456 bytes once. It is a cache, not state - fontFileHasGlyph()
 * returns the same answer whether or not it has run before.
 */
function decodeBitmap(base64) {
  let bits = bitmapCache.get(base64);
  if (!bits) {
    const binary = atob(base64);
    bits = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bits[i] = binary.charCodeAt(i);
    bitmapCache.set(base64, bits);
  }
  return bits;
}

/**
 * Does the exact font file `fileName` (as loadCustomFont() would request it)
 * have a glyph for `codePoint`? Returns false for a filename this table has
 * no data for, same as "no coverage" - callers that need to distinguish
 * "unknown file" from "known file, no glyph" should check FONT_COVERAGE_FILES
 * (src/editor/text/fontCoverageTable.js) themselves.
 */
export function fontFileHasGlyph(fileName, codePoint) {
  const ranges = FONT_COVERAGE[fileName];
  if (!ranges) return false;
  const bitmaps = FONT_COVERAGE_BITMAPS[fileName];
  if (bitmaps) {
    for (let i = 0; i < COVERAGE_BITMAP_BLOCKS.length; i += 1) {
      const base64 = bitmaps[i];
      if (!base64) continue;
      const [start, end] = COVERAGE_BITMAP_BLOCKS[i];
      if (codePoint >= start && codePoint <= end) {
        const bit = codePoint - start;
        return (decodeBitmap(base64)[bit >> 3] & (1 << (bit & 7))) !== 0;
      }
    }
  }
  return rangesHaveCodePoint(ranges, codePoint);
}
