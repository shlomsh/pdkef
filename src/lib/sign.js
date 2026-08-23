import { PDFDocument } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { percentToPoints } from './coords.js';
import { getElementDefinition } from '../editor/registry/index.ts';
import { unrepresentableCharacters } from '../editor/registry/text.ts';
import { combCellCount, combCharacters, isComb } from './comb.js';
import { HELVETICA_BASELINE_OFFSET_EM, DEFAULT_LINE_HEIGHT_EM } from '../constants/signGeometry.js';
import { resolveFontFamily } from './fonts.js';

export { detectTextDirection, getEffectiveTextDirection, hexToRgbFractions, tintImageDataUrl } from './signHelpers.js';

let pdfjsLib;
export async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjsLib;
}

// The catalogue and the Hebrew substitution rule live in fonts.js, which the
// editor also imports — see the note there on why both sides must share it.
export { HANDWRITING_FONTS, TEXT_FONTS, resolveFontFamily } from './fonts.js';

/**
 * Thrown by signPdf's coverage pre-pass (docs/hebrew-text-shaping-export.md,
 * "Layer 3") before any element is serialized, so a document with a character
 * no bundled font can draw for it is refused whole rather than downloaded
 * with that content silently missing. `characters` is deduplicated, in
 * first-seen order, for the caller to name in its own message.
 */
export class UnrepresentableTextError extends Error {
  constructor(characters, pageNumbers = []) {
    super(`No bundled font can draw: ${characters.join(', ')}`);
    this.name = 'UnrepresentableTextError';
    this.characters = characters;
    // 1-based page numbers, so the message can point at where to look. A
    // document refused without saying where is one the user cannot act on.
    this.pageNumbers = pageNumbers;
  }
}

let nextId = 0;
export function uniqueId() { return `el-${nextId++}`; }

export function seedUniqueId(elements) {
  let max = -1;
  for (const el of elements || []) {
    const match = /^el-(\d+)$/.exec(el?.id || '');
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  if (max + 1 > nextId) nextId = max + 1;
}

/**
 * Every character across every text element that its resolved, embedded font
 * has no glyph for - deduplicated, first-seen order across the whole
 * document (see docs/hebrew-text-shaping-export.md, "Layer 3: characters no
 * bundled font can draw are silently dropped"). Checked against
 * `resolveFontFamily`'s result, not the family the user picked, because that
 * is the font `serialize` will actually embed - a Latin-only face typed with
 * Hebrew is already swapped for a Hebrew-capable one by the time this runs.
 *
 * Comb fields are elements of `type: 'text'` too (see comb.js), so they get
 * no separate check - `element.text` is their content either way.
 *
 * Skips an element whose font fails to load entirely (loadCustomFont ->
 * null): this pre-pass only judges character coverage, and a font that never
 * loaded is a different failure `serialize` already surfaces on its own.
 */
async function findUnrepresentableCharacters(elements, loadCustomFont) {
  const seen = new Set();
  const missing = [];
  const pages = new Set();
  for (const element of elements) {
    if (element.type !== 'text') continue;
    const textValue = (element.text || '').trim();
    if (!textValue) continue;
    const embeddedFamily = resolveFontFamily(element.fontFamily, textValue);
    const resolvedFont = (await loadCustomFont(embeddedFamily, element.fontWeight, element.fontStyle))
      || (await loadCustomFont('Arimo', element.fontWeight, element.fontStyle));
    if (!resolvedFont) continue;
    // Judge only what will actually be drawn. A comb field renders
    // `slice(0, cellCount)` and silently ignores the rest, so checking the
    // whole string would refuse a document over a character that was never
    // going to reach the page - see text.ts's comb branch.
    const drawnText = isComb(element)
      ? combCharacters(element).slice(0, combCellCount(element)).join('')
      : textValue;
    const found = unrepresentableCharacters(resolvedFont, drawnText);
    if (found.length > 0) pages.add((element.pageIndex ?? 0) + 1);
    for (const ch of found) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      missing.push(ch);
    }
  }
  return { characters: missing, pageNumbers: [...pages].sort((a, b) => a - b) };
}

function baselineOffsetEm(pdfFont, lineHeightEm = DEFAULT_LINE_HEIGHT_EM) {
  try {
    const fk = pdfFont?.embedder?.font;
    if (fk?.unitsPerEm && Number.isFinite(fk?.ascent) && Number.isFinite(fk?.descent)) {
      return lineHeightEm / 2 + (fk.ascent / fk.unitsPerEm - Math.abs(fk.descent / fk.unitsPerEm)) / 2;
    }
  } catch {
    // Use the historic Helvetica fallback when fontkit metrics are unavailable.
  }
  return HELVETICA_BASELINE_OFFSET_EM;
}

// Bakes each element through its registry owner. Document loading and font caching
// stay here because they are PDF-wide concerns, not per-element behavior.
export async function signPdf(file, elements, onProgress) {
  const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
  pdfDoc.registerFontkit(fontkit);
  const loadedFonts = {};

  const fetchFont = async (fileName) => {
    if (loadedFonts[fileName]) return loadedFonts[fileName];
    const res = await fetch(`/fonts/${fileName}`);
    if (!res.ok) throw new Error(`${fileName}: ${res.status}`);
    const customFont = await pdfDoc.embedFont(await res.arrayBuffer());
    loadedFonts[fileName] = customFont;
    return customFont;
  };

  const loadCustomFont = async (fontFamily, fontWeight, fontStyle) => {
    let styleStr = 'Regular';
    if (fontWeight === 'bold' && fontStyle === 'italic') styleStr = 'BoldItalic';
    else if (fontWeight === 'bold') styleStr = 'Bold';
    else if (fontStyle === 'italic') styleStr = 'Italic';
    const baseName = fontFamily.replace(/\s+/g, '');
    try {
      return await fetchFont(`${baseName}-${styleStr}.ttf`);
    } catch (error) {
      if (styleStr === 'Regular') {
        console.warn(`Could not load custom font ${baseName}-${styleStr}.ttf`, error);
        return null;
      }
      console.warn(`Could not load ${baseName}-${styleStr}.ttf, falling back to ${baseName}-Regular.ttf`, error);
      try { return await fetchFont(`${baseName}-Regular.ttf`); }
      catch (fallbackError) {
        console.warn(`Could not load ${baseName}-Regular.ttf either`, fallbackError);
        return null;
      }
    }
  };

  // Refuse before writing anything, rather than embed a document some of
  // whose text silently has no glyphs (docs/hebrew-text-shaping-export.md,
  // "Layer 3"). Must run before the loop below touches pdfDoc at all - the
  // whole point is "refused" and "partially written" are never both true.
  const { characters: missingCharacters, pageNumbers } = await findUnrepresentableCharacters(elements, loadCustomFont);
  if (missingCharacters.length > 0) throw new UnrepresentableTextError(missingCharacters, pageNumbers);

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    const page = pdfDoc.getPage(element.pageIndex);
    const { width: pdfWidth, height: pdfHeight } = page.getSize();
    await getElementDefinition(element.type).serialize(element, {
      pdfDoc, page, pdfWidth, pdfHeight,
      pdfX: percentToPoints(element.left, pdfWidth),
      pdfY: pdfHeight - percentToPoints(element.top, pdfHeight),
      loadCustomFont, baselineOffset: baselineOffsetEm,
    });
    onProgress?.((i + 1) / elements.length);
  }

  return new Blob([await pdfDoc.save()], { type: 'application/pdf' });
}
