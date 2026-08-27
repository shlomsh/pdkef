import { PDFDocument } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { percentToPoints } from './coords.js';
import { getElementDefinition } from '../editor/registry/index.ts';
import { findUnrepresentableCharacters } from './textCoverage.js';
import { HELVETICA_BASELINE_OFFSET_EM, DEFAULT_LINE_HEIGHT_EM } from '../constants/signGeometry.js';

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

// The coverage policy - which elements get judged, which of their characters
// actually reach the page, and which font each resolves to - lives in
// textCoverage.js, so the editor's while-typing warning runs the exact same
// rule as this refusal. See that file's header for why the two must not fork.

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
    const customFont = await pdfDoc.embedFont(await res.arrayBuffer(), { subset: true });
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
