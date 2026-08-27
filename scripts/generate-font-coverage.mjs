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
    table[file] = toRanges(covered);
  }
  return table;
}

function formatRanges(ranges) {
  // One [start, end] pair per line-friendly chunk would be enormous (Arimo
  // alone has hundreds of ranges); keep it as compact literal array-of-arrays
  // so it stays a normal, greppable JS value rather than a bespoke format.
  return `[${ranges.map(([a, b]) => `[${a},${b}]`).join(',')}]`;
}

function generateSource(table, sizeComment) {
  const fileNames = Object.keys(table);
  const entries = fileNames
    .map((file) => `  ${JSON.stringify(file)}: ${formatRanges(table[file])},`)
    .join('\n');

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
 * Each value is a sorted array of [start, end] inclusive codepoint ranges
 * (fontkit's characterSet, range-encoded). Measured size across all
 * ${fileNames.length} bundled font files (every weight/style file in
 * public/fonts/, not just one per family): ${sizeComment}
 */

/** @type {Record<string, Array<[number, number]>>} */
export const FONT_COVERAGE = {
${entries}
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
