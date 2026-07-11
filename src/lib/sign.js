import { PDFDocument } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { percentToPoints } from './coords.js';
import { getElementDefinition } from '../editor/registry/index.ts';
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

export const HANDWRITING_FONTS = ['Caveat', 'Dancing Script', 'Great Vibes', 'Gveret Levin', 'Pacifico', 'Playpen Sans Hebrew', 'Sacramento'];
export const TEXT_FONTS = ['Arimo', 'Tinos', 'Cousine', 'Assistant', 'Heebo'];

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
