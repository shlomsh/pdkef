/**
 * Bidi-aware text for the flat fixtures - the only module that touches fontkit and bidi runs.
 * It reuses the app's own export path (read-only imports from src/): `resolveBidiRuns` splits a
 * line into same-direction runs in visual order, `shapedWidth` measures a run and `drawShapedRun`
 * emits shaped glyphs with an ActualText span, so the fixtures are drawn exactly like a Sign export.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { resolveBidiRuns } from '../../../src/editor/text/bidiRuns.js';
import { drawShapedRun } from '../../../src/editor/registry/textPdf.ts';
import { shapedWidth } from '../../../src/editor/text/textMetrics.ts';

const FONT_DIR = fileURLToPath(new URL('../../../public/fonts/', import.meta.url));
/** Fixed subset tags (six capitals, as the PDF spec asks) so font names do not depend on a random suffix. */
const SUBSET_TAGS = { regular: 'QAFRGR', bold: 'QAFBLD' };

/** Embeds a `{regular, bold}` pair of font files from public/fonts/ as subsets. */
export async function embedFonts(doc, fontFiles) {
  doc.registerFontkit(fontkit);
  const embedOne = (weight) => {
    const file = fontFiles[weight];
    const customName = `${SUBSET_TAGS[weight]}+${path.basename(file, '.ttf')}`;
    return doc.embedFont(fs.readFileSync(path.join(FONT_DIR, file)), { subset: true, customName });
  };
  return { regular: await embedOne('regular'), bold: await embedOne('bold') };
}

/**
 * Unicode Bidi_Mirroring for the brackets these forms use. fontkit's `layout(..., 'rtl')` reverses
 * glyph order but does NOT mirror brackets (measured: Heebo '(' is glyph 386 in both directions),
 * so `drawShapedRun` alone paints an unmirrored "(" inside a right-to-left run. The fixtures
 * mirror them before shaping, as a browser does; src/ is left as is.
 */
const MIRRORED = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' };
const mirrorBrackets = (text) => Array.from(text, (char) => MIRRORED[char] ?? char).join('');

function shapeLine(font, text, size, direction) {
  const runs = resolveBidiRuns(text, direction).map((run) => {
    const runText = run.direction === 'rtl' ? mirrorBrackets(run.text) : run.text;
    return { text: runText, direction: run.direction, width: shapedWidth(font, runText, size, run.direction) };
  });
  return { runs, width: runs.reduce((sum, run) => sum + run.width, 0) };
}

/**
 * Draws one line. `x` is the anchor and `align` says which point of the line sits on it
 * ('left' | 'right' | 'center'); `baseline` is in PDF user space. `direction` is the paragraph
 * direction. Returns the horizontal extent actually painted, so callers can check margins.
 */
export function drawLine(page, font, text, { x, baseline, size, color, direction, align }) {
  const { runs, width } = shapeLine(font, text, size, direction);
  const left = { left: x, right: x - width, center: x - width / 2 }[align];
  let pen = left;
  for (const run of runs) {
    drawShapedRun(page, { text: run.text, pdfFont: font, size, x: pen, y: baseline, color, direction: run.direction });
    pen += run.width;
  }
  return { left, right: left + width };
}
