import { PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { percentToPoints } from './coords.js';

// First strong-directional character wins (matches the Unicode bidi
// algorithm's approach, and what dir="auto" does under the hood) —
// covers the Hebrew and Arabic script blocks, including presentation forms.
const RTL_CHAR = /[\u0591-\u07FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
function detectTextDirection(text) {
  return RTL_CHAR.test(text || '') ? 'rtl' : 'ltr';
}

// `element.textDirection` is a manual override (set via the toolbar's direction
// toggle) for when the user wants RTL layout before typing anything. Falls back
// to content-based auto-detection when no override is set. Shared between the
// editor (DraggableOverlayElement.jsx, for right-edge CSS anchoring) and signPdf
// below (for right-aligning baked text against that same edge) so the two never
// disagree about which elements are RTL.
export function getEffectiveTextDirection(element) {
  return element.textDirection || detectTextDirection(element.text);
}

// Dynamic loader for PDFJS, shared across the Sign tool's page rendering and file loading.
let pdfjsLib;
export async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href;
  }
  return pdfjsLib;
}

// Handwriting fonts bundled for the signature "type" mode; also selectable as
// text-element fonts (FontPickerMenu.jsx), so this is the single source of truth
// for both the font-picker options and signPdf's custom-font embedding below.
export const HANDWRITING_FONTS = [
  'Caveat',
  'Dancing Script',
  'Great Vibes',
  'Gveret Levin',
  'Pacifico',
  'Playpen Sans Hebrew',
  'Sacramento'
];

let nextId = 0;
export function uniqueId() {
  return `el-${nextId++}`;
}

// After restoring saved elements (ids like "el-7"), the module-level counter is still
// 0, so fresh placements would collide with restored ids. Seed the counter past the
// highest numeric suffix present so new ids stay unique.
export function seedUniqueId(elements) {
  let max = -1;
  for (const el of elements || []) {
    const match = /^el-(\d+)$/.exec(el?.id || '');
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  if (max + 1 > nextId) nextId = max + 1;
}

export function hexToRgbFractions(hex, fallback = '#000000') {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || fallback);
  const r = result ? parseInt(result[1], 16) / 255 : 0;
  const g = result ? parseInt(result[2], 16) / 255 : 0;
  const b = result ? parseInt(result[3], 16) / 255 : 0;
  return { r, g, b };
}

// Recolors a signature PNG's ink while preserving its alpha shape (drawn/typed
// signatures are opaque strokes on a transparent background).
export function tintImageDataUrl(dataUrl, hexColor) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = hexColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Bakes placed text/checkmark/signature elements into the PDF and returns the
// signed result as a Blob. Runs entirely in-memory in the browser - no network
// I/O except fetching bundled custom fonts from same-origin /fonts/.
export async function signPdf(file, elements, onProgress) {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);
  pdfDoc.registerFontkit(fontkit);

  const loadedFonts = {};
  const fetchFont = async (fileName) => {
    if (loadedFonts[fileName]) return loadedFonts[fileName];
    const res = await fetch(`/fonts/${fileName}`);
    if (!res.ok) throw new Error(`${fileName}: ${res.status}`);
    const fontBytes = await res.arrayBuffer();
    const customFont = await pdfDoc.embedFont(fontBytes);
    loadedFonts[fileName] = customFont;
    return customFont;
  };

  // Not every bundled font family ships Bold/Italic variants (the handwriting
  // fonts only have a Regular file) — fall back to that family's own Regular
  // weight rather than jumping all the way to Helvetica, so a bolded/italicized
  // handwriting-font text element still renders in the right typeface, just
  // without the weight/style the file doesn't have.
  const loadCustomFont = async (fontFamily, fontWeight, fontStyle) => {
    let styleStr = 'Regular';
    if (fontWeight === 'bold' && fontStyle === 'italic') styleStr = 'BoldItalic';
    else if (fontWeight === 'bold') styleStr = 'Bold';
    else if (fontStyle === 'italic') styleStr = 'Italic';
    // Font files are named without spaces (e.g. "Dancing Script" -> DancingScript-Regular.ttf).
    const baseName = fontFamily.replace(/\s+/g, '');
    const fileName = `${baseName}-${styleStr}.ttf`;

    try {
      return await fetchFont(fileName);
    } catch (e) {
      if (styleStr === 'Regular') {
        console.warn(`Could not load custom font ${fileName}`, e);
        return null;
      }
      console.warn(`Could not load ${fileName}, falling back to ${baseName}-Regular.ttf`, e);
      try {
        return await fetchFont(`${baseName}-Regular.ttf`);
      } catch (e2) {
        console.warn(`Could not load ${baseName}-Regular.ttf either`, e2);
        return null;
      }
    }
  };

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const page = pdfDoc.getPage(el.pageIndex);
    const { width: pdfWidth, height: pdfHeight } = page.getSize();

    // Map screen percentages to PDF points
    const pdfX = percentToPoints(el.left, pdfWidth);
    const pdfY = pdfHeight - percentToPoints(el.top, pdfHeight);

    if (el.type === 'text') {
      const fontSizeInPoints = el.fontSize || 12;
      const textValue = (el.text || '').trim();
      if (!textValue) continue;

      let resolvedFont = helveticaFont;
      if (el.fontFamily && ['Arimo', 'Heebo', 'Assistant', ...HANDWRITING_FONTS].includes(el.fontFamily)) {
        const customFont = await loadCustomFont(el.fontFamily, el.fontWeight, el.fontStyle);
        if (customFont) resolvedFont = customFont;
      } else {
        if (el.fontWeight === 'bold' && el.fontStyle === 'italic') {
          resolvedFont = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
        } else if (el.fontWeight === 'bold') {
          resolvedFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        } else if (el.fontStyle === 'italic') {
          resolvedFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
        }
      }

      const { r, g, b } = hexToRgbFractions(el.color);

      // Helvetica baseline offset is roughly 85% of line height
      const baselineAdjustedY = pdfY - (fontSizeInPoints * 0.85);
      const lineHeight = fontSizeInPoints * 1.2; // matches the editor's CSS line-height

      // The editor anchors RTL text boxes by their *right* edge (see
      // DraggableOverlayElement.jsx's `style` block: `right: 100 - element.left`),
      // so for RTL elements `el.left` is the right edge's x, not the left-start x
      // drawText expects. Draw each line separately, right-aligning it against
      // that edge using the font's own metrics — measuring in the DOM isn't an
      // option here (this runs with no page rendered), and per-line alignment
      // also fixes lines of differing length collapsing to one shared left x.
      const isRtl = getEffectiveTextDirection(el) === 'rtl';
      const lines = textValue.split(/\r?\n/);
      lines.forEach((line, lineIndex) => {
        const y = baselineAdjustedY - lineIndex * lineHeight;
        const lineWidth = resolvedFont.widthOfTextAtSize(line, fontSizeInPoints);
        const x = isRtl ? pdfX - lineWidth : pdfX;
        page.drawText(line, {
          x,
          y,
          size: fontSizeInPoints,
          font: resolvedFont,
          color: rgb(r, g, b)
        });
      });
    } else if (el.type === 'checkmark') {
      const elWidthPoints = percentToPoints(el.width, pdfWidth);
      const elHeightPoints = percentToPoints(el.height, pdfHeight);
      const { r: cr, g: cg, b: cb } = hexToRgbFractions(el.color, '#1463ff');

      if (el.mark === 'x') {
        // Draw vector X: corner-to-corner diagonals
        page.drawLine({
          start: { x: pdfX, y: pdfY },
          end: { x: pdfX + elWidthPoints, y: pdfY - elHeightPoints },
          thickness: 2.2,
          color: rgb(cr, cg, cb)
        });
        page.drawLine({
          start: { x: pdfX + elWidthPoints, y: pdfY },
          end: { x: pdfX, y: pdfY - elHeightPoints },
          thickness: 2.2,
          color: rgb(cr, cg, cb)
        });
      } else {
        // Draw vector checkmark
        // Start: Left edge, 40% height up from bottom
        page.drawLine({
          start: { x: pdfX, y: pdfY - elHeightPoints * 0.6 },
          end: { x: pdfX + elWidthPoints * 0.35, y: pdfY - elHeightPoints },
          thickness: 2.2,
          color: rgb(cr, cg, cb)
        });
        // End: Top-right edge
        page.drawLine({
          start: { x: pdfX + elWidthPoints * 0.35, y: pdfY - elHeightPoints },
          end: { x: pdfX + elWidthPoints, y: pdfY },
          thickness: 2.2,
          color: rgb(cr, cg, cb)
        });
      }
    } else if (el.type === 'signature' && el.dataUrl) {
      const elWidthPoints = percentToPoints(el.width, pdfWidth);
      const elHeightPoints = percentToPoints(el.height, pdfHeight);
      const sourceDataUrl = el.color && el.color !== '#000000'
        ? await tintImageDataUrl(el.dataUrl, el.color)
        : el.dataUrl;
      const base64Data = sourceDataUrl.split(',')[1];
      const embeddedImage = await pdfDoc.embedPng(base64Data);

      page.drawImage(embeddedImage, {
        x: pdfX,
        y: pdfY - elHeightPoints, // origin at bottom-left of image box
        width: elWidthPoints,
        height: elHeightPoints
      });
    } else if (el.type === 'whiteout') {
      const elWidthPoints = percentToPoints(el.width, pdfWidth);
      const elHeightPoints = percentToPoints(el.height, pdfHeight);
      const { r, g, b } = hexToRgbFractions(el.color, '#ffffff');

      page.drawRectangle({
        x: pdfX,
        y: pdfY - elHeightPoints,
        width: elWidthPoints,
        height: elHeightPoints,
        color: rgb(r, g, b)
      });
    }

    onProgress?.((i + 1) / elements.length);
  }

  const signedBytes = await pdfDoc.save();
  return new Blob([signedBytes], { type: 'application/pdf' });
}
