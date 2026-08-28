#!/usr/bin/env node
/**
 * Generates src/lib/fontCoverageTable.js from the real font bytes in
 * public/fonts/.
 *
 * This is the substrate for W3 (see TODO.md and docs/wysiwyg-text-architecture.md
 * §3.1/§3.2/§3.4): a coverage-based font resolver needs to ask "does this exact
 * embedded file have a glyph for this codepoint" synchronously, from both the
 * editor and the exporter, without fetching or parsing a TTF at runtime. So the
 * coverage of every bundled font file is computed once, here, at build/dev time,
 * and committed as a plain data module.
 *
 * Run with: npm run generate:font-coverage
 *
 * Whenever a font file in public/fonts/ is added, removed, or replaced, rerun
 * this script and commit the result. src/lib/fontCoverageTable.test.js fails
 * the build if the committed table and the real bytes disagree.
 *
 * The encoding is a hybrid, per file and per block, and picked by measurement
 * rather than from a list of font names - see BITMAP_CANDIDATE_BLOCKS below.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import fontkit from '@pdf-lib/fontkit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const FONT_DIR = join(REPO_ROOT, 'public', 'fonts');
const OUT_FILE = join(REPO_ROOT, 'src', 'lib', 'fontCoverageTable.js');

/**
 * Blocks where a bitmap is allowed to compete with the range list.
 *
 * Range encoding is optimal when coverage is contiguous, which is the normal
 * case: Latin, Hebrew, Cyrillic, Greek, Thai, Devanagari, Bengali and even
 * Hangul syllables are each a handful of long runs. It is pathological when
 * coverage is scattered one codepoint at a time, which is exactly what a Han
 * subset looks like: Noto Sans TC covers 11,147 codepoints of U+3400-U+9FFF
 * in 4,210 separate ranges, so almost every "range" is a single character
 * paying for two numbers and three punctuation bytes.
 *
 * U+3400-U+9FFF is CJK Unified Ideographs Extension A plus the main CJK
 * Unified Ideographs block, contiguously - 27,648 codepoints, so one bitmap
 * is a fixed 3,456 bytes (4,608 base64 characters) no matter how much of it
 * a font covers. That fixed cost is why this is a candidate list and not a
 * rule applied everywhere: for a font with no Han at all, the bitmap is 4,608
 * characters of zeros where the range list is `[]`.
 *
 * Which one a given file actually gets is decided by chooseEncoding() below,
 * by measuring both, so a font is never hand-classified as "a CJK font".
 */
const BITMAP_CANDIDATE_BLOCKS = [[0x3400, 0x9fff]];

/**
 * Collapses a sorted array of codepoints into an array of [start, end]
 * inclusive ranges. Real TTFs cover long contiguous Unicode blocks (Latin,
 * Hebrew, punctuation, etc.), so this is a large compression win over listing
 * every codepoint, and a plain [start, end] pair is something a human can
 * read directly without a decoder.
 */
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
  // One [start, end] pair per line-friendly chunk would be enormous (Arimo
  // alone has hundreds of ranges); keep it as compact literal array-of-arrays
  // so it stays a normal, greppable JS value rather than a bespoke format.
  return `[${ranges.map(([a, b]) => `[${a},${b}]`).join(',')}]`;
}

/** Base64 of a little-endian bit-per-codepoint bitmap of `[start, end]`. */
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
 * Encodes one file's coverage as ranges, with a bitmap substituted for any
 * candidate block where the bitmap is the smaller of the two as source text.
 *
 * The comparison is the stated rule: both encodings are produced and the
 * shorter one wins. Source length rather than compressed length because the
 * per-block figure has to be decidable on its own, and the two orders agree
 * comfortably here - the crossover is around 330 ranges in a block, where a
 * font is already well into the scattered regime that the bitmap exists for.
 * Measured, the rule picks the bitmap for exactly the three Han-covering
 * files it should (SC 53,075 -> 4,610 source characters, TC 58,941 -> 4,610,
 * JP 32,257 -> 4,610) and leaves everything else alone, Korean included:
 * Hangul syllables are one contiguous run outside this block, so Noto Sans
 * KR's share of the block is empty and its `[]` beats 4,608 zero bits.
 */
function chooseEncoding(covered) {
  const bitmaps = [];
  let remaining = covered;
  for (const [start, end] of BITMAP_CANDIDATE_BLOCKS) {
    const inBlock = remaining.filter((cp) => cp >= start && cp <= end);
    const asRanges = formatRanges(toRanges(inBlock));
    const asBitmap = toBitmap(inBlock, start, end);
    // +2 for the quotes the bitmap costs as a JS string literal.
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

function computeTable() {
  const files = readdirSync(FONT_DIR).filter((name) => name.endsWith('.ttf')).sort();
  const table = {};
  for (const file of files) {
    const bytes = readFileSync(join(FONT_DIR, file));
    const font = fontkit.create(bytes);
    // characterSet is the fast source, but it is not the same claim as
    // hasGlyphForCodePoint - every bundled font's characterSet includes
    // U+FFFF (a permanently-reserved Unicode noncharacter, present as a cmap
    // sentinel) while hasGlyphForCodePoint(0xffff) correctly says false. That
    // is a real, measured disagreement, not a hypothetical one, which is why
    // this filters characterSet through hasGlyphForCodePoint rather than
    // trusting it directly - the table's whole reason to exist is to answer
    // exactly the question hasGlyphForCodePoint answers, synchronously.
    const covered = font.characterSet.filter((cp) => font.hasGlyphForCodePoint(cp));
    table[file] = chooseEncoding(covered);
  }
  return table;
}

function generateSource(table, sizeComment) {
  const fileNames = Object.keys(table);
  const entries = fileNames
    .map((file) => `  ${JSON.stringify(file)}: ${formatRanges(table[file].ranges)},`)
    .join('\n');
  const bitmapEntries = fileNames
    .filter((file) => table[file].bitmaps)
    .map(
      (file) =>
        `  ${JSON.stringify(file)}: [${table[file].bitmaps
          .map((b) => (b === null ? 'null' : JSON.stringify(b)))
          .join(',')}],`,
    )
    .join('\n');
  const blocks = BITMAP_CANDIDATE_BLOCKS.map(([a, b]) => `[${a},${b}]`).join(', ');

  return `/**
 * GENERATED FILE - do not hand-edit.
 *
 * Produced by scripts/generate-font-coverage.mjs from the real font bytes in
 * public/fonts/. Rerun that script (npm run generate:font-coverage) and
 * commit the result whenever a font file is added, removed, or replaced.
 * src/lib/fontCoverageTable.test.js regenerates this in memory and fails if
 * it disagrees with what is committed here.
 *
 * Keyed by the exact filename src/lib/sign.js's loadCustomFont() requests -
 * "\${family.replace(/\\s+/g, '')}-\${Regular|Bold|Italic|BoldItalic}.ttf" -
 * because glyph coverage belongs to the specific (family, weight, style) file
 * that gets embedded, not to the family as a whole (see
 * docs/wysiwyg-text-architecture.md §3.4).
 *
 * The encoding is a hybrid of two representations of the same set, picked per
 * file and per block by measuring both (see chooseEncoding() in the
 * generator), never from a list of font names:
 *
 *   - FONT_COVERAGE holds sorted [start, end] inclusive codepoint ranges,
 *     which is optimal for the contiguous case that almost every script is.
 *   - COVERAGE_BITMAP_BLOCKS / FONT_COVERAGE_BITMAPS hold a base64 bit-per-
 *     codepoint bitmap for a block where coverage is scattered enough that
 *     ranges cost more than the bitmap's fixed size. Only Han qualifies
 *     today: a Han subset covers thousands of codepoints one at a time, so
 *     range-encoding it cost 8KB brotli per file where the bitmap costs 2.4KB,
 *     on a module every editor session downloads whatever font it uses.
 *
 * A file's ranges never overlap a block its bitmap owns, so the two are read
 * as one set and neither is the whole answer on its own - go through
 * fontFileHasGlyph(), which stays synchronous and pure either way.
 *
 * Measured size across all ${fileNames.length} bundled font files (every weight/style file in
 * public/fonts/, not just one per family): ${sizeComment}
 */

/** @type {Record<string, Array<[number, number]>>} */
export const FONT_COVERAGE = {
${entries}
};

/**
 * Blocks encoded as bitmaps, index-aligned with the arrays in
 * FONT_COVERAGE_BITMAPS. Each entry is an inclusive [start, end].
 * @type {Array<[number, number]>}
 */
export const COVERAGE_BITMAP_BLOCKS = [${blocks}];

/**
 * Per file, one entry per block in COVERAGE_BITMAP_BLOCKS: a base64 bitmap
 * (bit i = codepoint start + i, little-endian within each byte) when that
 * block is bitmap-encoded for this file, or null when the file's ranges carry
 * it instead. A file absent from this object is entirely range-encoded.
 * @type {Record<string, Array<string | null>>}
 */
export const FONT_COVERAGE_BITMAPS = {
${bitmapEntries}
};

/** Every font filename this table has coverage data for. */
export const FONT_COVERAGE_FILES = Object.freeze(Object.keys(FONT_COVERAGE));

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
 * Does the exact font file \`fileName\` (as loadCustomFont() would request it)
 * have a glyph for \`codePoint\`? Returns false for a filename this table has
 * no data for, same as "no coverage" - callers that need to distinguish
 * "unknown file" from "known file, no glyph" should check FONT_COVERAGE_FILES
 * themselves.
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
`;
}

function main() {
  const table = computeTable();
  // Two passes: the header comment records the file's own measured size, so
  // generate once to measure, then regenerate with that number filled in.
  // The comment text itself shifts the byte count by a few bytes at most,
  // which is why the recorded figures are rounded rather than claimed exact.
  const draft = generateSource(table, 'measuring...');
  const draftRaw = Buffer.byteLength(draft, 'utf8');
  const draftBrotli = brotliCompressSync(Buffer.from(draft, 'utf8')).length;
  const sizeComment = `approximately ${draftRaw} raw bytes, ${draftBrotli} brotli bytes.`;
  const source = generateSource(table, sizeComment);
  writeFileSync(OUT_FILE, source);
  const raw = Buffer.byteLength(source, 'utf8');
  const brotli = brotliCompressSync(Buffer.from(source, 'utf8')).length;
  console.log(`Wrote ${OUT_FILE}`);
  console.log(`${Object.keys(table).length} font files, ${raw} raw bytes, ${brotli} brotli bytes`);
}

main();
