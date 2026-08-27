import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fontsDir = path.join(__dirname, '..', 'public', 'fonts');

/*
 * Guards against a shipped-once regression: two of the 38 bundled TTFs had a
 * `glyf` table whose per-glyph outlines are not 2-byte aligned. `sign.js` embeds
 * fonts with `{ subset: true }` (turned on to cut a signed PDF with one Arimo
 * text box from ~279 KB to ~6 KB), and pdf-lib's embedder hands subsetting off to
 * fontkit's TTF subsetter, which reads each glyph's outline out of `glyf` at the
 * byte offset `loca` gives it. If those offsets are odd - which only happens when
 * an odd-length glyph (commonly `.notdef`, glyph 0, which every subset includes)
 * throws off the alignment of every glyph after it - the subsetter reads garbage
 * for every subsequent glyph and throws ("Trying to access beyond buffer length")
 * or emits corrupt/missing glyphs in the downloaded PDF. Nothing else in this repo's
 * test suite catches it: `fontCoverage.test.js` checks cmap (which glyph is used
 * for which codepoint), not whether that glyph's outline bytes are alignable, and
 * the W1 export render guard only samples specific font/script combinations.
 *
 * Root cause, found by bisecting all 38 bundled fonts: `Kalam-Regular.ttf` and
 * `Kalam-Bold.ttf` had a `.notdef` glyph that was an odd number of bytes (51), so
 * roughly half of each font's `loca` offsets landed on odd byte boundaries. Fixed
 * by re-padding `glyf` to 4-byte alignment with fontTools (`font['glyf'].padding
 * = 4; font.save(...)`), which changes no outline, only padding - verified by
 * comparing per-glyph path-command counts before/after across a 60-glyph sample
 * (0 mismatches) and confirming the `.notdef`-glyph subset of `नमस्ते` renders
 * identically. See the "devanagari-kalam" case in
 * `e2e/sign/export-render-guard.spec.js` and CLAUDE.md's font-subsetting notes.
 *
 * This script parses `loca` the same way fontkit's subsetter will and fails, by
 * name, on any bundled font with an odd-aligned offset - so a font added later
 * with the same defect fails the build instead of shipping silently broken until
 * someone happens to subset the right script through the right font.
 */

function readTable(buf, tag) {
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const recordOffset = 12 + i * 16;
    const recordTag = buf.toString('ascii', recordOffset, recordOffset + 4);
    if (recordTag === tag) {
      const offset = buf.readUInt32BE(recordOffset + 8);
      const length = buf.readUInt32BE(recordOffset + 12);
      return { offset, length };
    }
  }
  return null;
}

function checkFont(filePath) {
  const buf = fs.readFileSync(filePath);

  const headTable = readTable(buf, 'head');
  const locaTable = readTable(buf, 'loca');
  const maxpTable = readTable(buf, 'maxp');
  const glyfTable = readTable(buf, 'glyf');

  if (!headTable || !locaTable || !maxpTable || !glyfTable) {
    // Not a glyf-outline TTF (e.g. CFF/OTF) - nothing for this check to say.
    return { skipped: true };
  }

  const indexToLocFormat = buf.readInt16BE(headTable.offset + 50);
  const numGlyphs = buf.readUInt16BE(maxpTable.offset + 4);
  const numLocaEntries = numGlyphs + 1;

  const offsets = [];
  if (indexToLocFormat === 0) {
    // short format: offsets are stored /2
    for (let i = 0; i < numLocaEntries; i++) {
      offsets.push(buf.readUInt16BE(locaTable.offset + i * 2) * 2);
    }
  } else {
    for (let i = 0; i < numLocaEntries; i++) {
      offsets.push(buf.readUInt32BE(locaTable.offset + i * 4));
    }
  }

  const oddOffsets = offsets.filter((o) => o % 2 !== 0);
  return { skipped: false, oddCount: oddOffsets.length, total: offsets.length };
}

const files = fs.readdirSync(fontsDir).filter((f) => f.toLowerCase().endsWith('.ttf'));

if (files.length === 0) {
  console.error(`No .ttf files found in ${fontsDir}`);
  process.exit(1);
}

const failures = [];

for (const file of files) {
  const filePath = path.join(fontsDir, file);
  const result = checkFont(filePath);
  if (result.skipped) continue;
  if (result.oddCount > 0) {
    failures.push({ file, ...result });
  }
}

if (failures.length > 0) {
  console.error('Font glyf-alignment guard failed: unaligned `loca` offsets found.\n');
  console.error(
    'sign.js embeds fonts with `{ subset: true }`; fontkit\'s TTF subsetter reads glyph outlines out of ' +
      "`glyf` at the byte offsets `loca` gives it. An odd-length glyph (commonly `.notdef`, which every " +
      'subset includes) throws off alignment for every glyph after it, so the subsetter reads garbage and ' +
      "either throws (\"Trying to access beyond buffer length\") or emits corrupt/missing glyphs in the " +
      'downloaded PDF - a failure invisible in the editor and only visible in the exported file.\n',
  );
  for (const f of failures) {
    console.error(`  ${f.file}: ${f.oddCount}/${f.total} loca offsets are odd-aligned`);
  }
  console.error(
    '\nFix by re-padding the glyf table to 4-byte alignment with fontTools (changes no outline, only ' +
      "padding):\n\n  from fontTools.ttLib import TTFont\n  f = TTFont(path)\n  f['glyf'].padding = 4\n  f.save(path)\n\n" +
      'Then re-verify outlines are unchanged (compare per-glyph path-command counts before/after) before ' +
      'overwriting the bundled file. This exact fix was applied to Kalam-Regular.ttf and Kalam-Bold.ttf; ' +
      'see the comment at the top of this script and CLAUDE.md.',
  );
  process.exit(1);
}

console.log(`Font glyf-alignment guard passed: ${files.length} fonts checked, all loca offsets 2-byte aligned.`);
