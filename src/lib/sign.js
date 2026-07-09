import { PDFDocument, rgb, LineCapStyle } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { percentToPoints } from './coords.js';
import {
  HELVETICA_BASELINE_OFFSET_EM,
  DEFAULT_LINE_HEIGHT_EM,
  DEFAULT_FONT_SIZE_PT,
  TEXT_BOX_PADDING_EM,
  DEFAULT_COLOR_BLUE
} from '../constants/signGeometry.js';


// First strong-directional character wins (matches the Unicode bidi
// algorithm's approach, and what dir="auto" does under the hood).
const STRONG_DIRECTION_CHAR = /[A-Za-z\u0591-\u07FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const RTL_CHAR = /[\u0591-\u07FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
export function detectTextDirection(text) {
  const firstStrong = (text || '').match(STRONG_DIRECTION_CHAR)?.[0];
  if (!firstStrong) return null;
  return RTL_CHAR.test(firstStrong) ? 'rtl' : 'ltr';
}

// Typed content is the source of truth. `element.textDirection` is only a
// fallback seed for an empty/non-strong-direction text box, usually copied from
// the last direction the user chose when creating a new box. Shared between the
// editor and signPdf below so preview and export never disagree.
export function getEffectiveTextDirection(element) {
  return detectTextDirection(element.text) || element.textDirection || 'ltr';
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

// Sans/serif/mono text-element fonts (FontPickerMenu.jsx's STANDARD_FONTS).
// Arimo/Tinos/Cousine are the Croscore family: metric-compatible with
// Helvetica/Times New Roman/Courier New, but — unlike pdf-lib's built-in
// StandardFonts — bundled here as real embedded TTFs that also carry Hebrew
// glyphs. Every option in the picker is one of these embedded families; there
// is intentionally no separate "standard PDF font" code path in signPdf below,
// since that path only supported Latin glyphs and silently baked non-Latin
// text (e.g. Hebrew) as "?" on export while looking fine in the browser
// preview (the browser silently font-substitutes for missing glyphs; pdf-lib's
// WinAnsi-encoded StandardFonts do not).
export const TEXT_FONTS = ['Arimo', 'Tinos', 'Cousine', 'Assistant', 'Heebo'];

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

// Distance from the top of a text line box down to its first baseline, as a
// fraction of font size. Mirrors how the browser places the baseline: the
// font's ascent plus half the line-height leading. A fixed 0.85 (Helvetica's
// value) used to be applied to every font, which drifted for the embedded
// Heebo/Assistant/Arimo and cursive handwriting fonts, since each has different
// ascent/descent metrics - so a typed cursive signature landed slightly off in
// the exported PDF versus the editor preview. We now derive it per font.
//
// Reads metrics off the embedder's underlying fontkit font. That's an internal
// pdf-lib field, so it's guarded: if the shape ever changes, we fall back to
// 0.85 (Helvetica's own value) and behave exactly as before (no throw, no
// regression) rather than mis-placing every line of text.
function baselineOffsetEm(pdfFont, lineHeightEm = DEFAULT_LINE_HEIGHT_EM) {
  try {
    const fk = pdfFont?.embedder?.font;
    const unitsPerEm = fk?.unitsPerEm;
    const ascent = fk?.ascent;
    const descent = fk?.descent;
    if (unitsPerEm && Number.isFinite(ascent) && Number.isFinite(descent)) {
      const ascentEm = ascent / unitsPerEm;
      const descentEm = Math.abs(descent) / unitsPerEm;
      return lineHeightEm / 2 + (ascentEm - descentEm) / 2;
    }
  } catch {
    // fall through to the Helvetica default
  }
  return HELVETICA_BASELINE_OFFSET_EM;
}

// Bakes placed text/symbol/signature elements into the PDF and returns the
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

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const page = pdfDoc.getPage(el.pageIndex);
    const { width: pdfWidth, height: pdfHeight } = page.getSize();

    // Map screen percentages to PDF points
    const pdfX = percentToPoints(el.left, pdfWidth);
    const pdfY = pdfHeight - percentToPoints(el.top, pdfHeight);

    if (el.type === 'text') {
      const fontSizeInPoints = el.fontSize || DEFAULT_FONT_SIZE_PT;
      const textValue = (el.text || '').trim();
      if (!textValue) continue;

      // Every selectable font (TEXT_FONTS + HANDWRITING_FONTS) is a bundled TTF,
      // embedded here the same way it's rendered in the editor preview via
      // @font-face — one code path, so glyph coverage (and thus what does or
      // doesn't render) can never differ between screen and export.
      const resolvedFont = (await loadCustomFont(el.fontFamily || 'Arimo', el.fontWeight, el.fontStyle))
        || (await loadCustomFont('Arimo', el.fontWeight, el.fontStyle));

      const { r, g, b } = hexToRgbFractions(el.color);

      // Baseline placement. `pdfY` is the box top (from el.top). Two offsets drop
      // to the first baseline:
      //   - baselineOffsetEm(resolvedFont): the font's ascent + half-leading,
      //     derived per font so custom/handwriting fonts match the editor preview
      //     (falls back to Helvetica's ~0.85 when metrics aren't readable).
      //   - TEXT_BOX_PADDING_EM: the editor renders text with this much top padding
      //     (see `.sign-text-input, .sign-text-measure` in global.css), which pushes
      //     the on-screen baseline down by the same amount. The export must match it
      //     or preview and output drift. Keep this constant in sync with the CSS.
      const baselineAdjustedY =
        pdfY - fontSizeInPoints * (baselineOffsetEm(resolvedFont) + TEXT_BOX_PADDING_EM);
      const lineHeight = fontSizeInPoints * DEFAULT_LINE_HEIGHT_EM; // matches the editor's CSS line-height

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
    } else if (el.type === 'symbol') {
      const elWidthPoints = percentToPoints(el.width, pdfWidth);
      const elHeightPoints = percentToPoints(el.height, pdfHeight);
      const { r: cr, g: cg, b: cb } = hexToRgbFractions(el.color, '#1463ff');

      if (el.mark === 'x') {
        // Mirrors SVG: two lines x1="4" y1="4" x2="20" y2="20" and x1="20" y1="4" x2="4" y2="20"
        // on a 24×24 viewBox, stroke-linecap="round", stroke-width="3".
        // Thickness scales with element size the same way SVG stroke-width="3" does on 24px.
        const thickness = (elWidthPoints / 24) * 3;
        page.drawLine({
          start: { x: pdfX + elWidthPoints * (4 / 24),  y: pdfY - elHeightPoints * (4 / 24) },
          end:   { x: pdfX + elWidthPoints * (20 / 24), y: pdfY - elHeightPoints * (20 / 24) },
          thickness,
          color: rgb(cr, cg, cb),
          lineCap: LineCapStyle.Round,
        });
        page.drawLine({
          start: { x: pdfX + elWidthPoints * (20 / 24), y: pdfY - elHeightPoints * (4 / 24) },
          end:   { x: pdfX + elWidthPoints * (4 / 24),  y: pdfY - elHeightPoints * (20 / 24) },
          thickness,
          color: rgb(cr, cg, cb),
          lineCap: LineCapStyle.Round,
        });
      } else if (el.mark === 'dot') {
        // Mirrors SVG: circle cx="12" cy="12" r="8" on a 24×24 viewBox, fill="currentColor".
        page.drawEllipse({
          x: pdfX + elWidthPoints / 2,
          y: pdfY - elHeightPoints / 2,
          xScale: elWidthPoints * (8 / 24),
          yScale: elHeightPoints * (8 / 24),
          color: rgb(cr, cg, cb),
          borderWidth: 0,
        });
      } else {
        // Mirrors SVG: polyline points="20 6 9 17 4 12" on a 24×24 viewBox,
        // stroke-linecap="round", stroke-linejoin="round", stroke-width="3".
        // SVG Y is top-down; PDF Y is bottom-up — flip: pdfY = pdfY_top - svgY%*height.
        // Normalized coords from the viewBox:
        //   start  (4,12)/24  → left edge, mid-height
        //   elbow  (9,17)/24  → inner bottom of the tick
        //   end   (20,6)/24   → far right, near top
        const thickness = (elWidthPoints / 24) * 3;
        // Segment 1: left-mid → elbow
        page.drawLine({
          start: { x: pdfX + elWidthPoints * (4 / 24),  y: pdfY - elHeightPoints * (12 / 24) },
          end:   { x: pdfX + elWidthPoints * (9 / 24),  y: pdfY - elHeightPoints * (17 / 24) },
          thickness,
          color: rgb(cr, cg, cb),
          lineCap: LineCapStyle.Round,
        });
        // Segment 2: elbow → top-right
        page.drawLine({
          start: { x: pdfX + elWidthPoints * (9 / 24),  y: pdfY - elHeightPoints * (17 / 24) },
          end:   { x: pdfX + elWidthPoints * (20 / 24), y: pdfY - elHeightPoints * (6 / 24) },
          thickness,
          color: rgb(cr, cg, cb),
          lineCap: LineCapStyle.Round,
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
    } else if (el.type === 'ellipse' || el.type === 'rectangle' || el.type === 'line') {
      // el.type is the geometry discriminator directly (no shape/shapeType wrapper).
      const actualType = el.type;
      const { r: cr, g: cg, b: cb } = hexToRgbFractions(el.color, '#1463ff');
      const thickness = el.strokeWidth || 3;
      
      if (actualType === 'ellipse') {
        const elWidthPoints = percentToPoints(el.width, pdfWidth);
        const elHeightPoints = percentToPoints(el.height, pdfHeight);
        page.drawEllipse({
          x: pdfX + elWidthPoints / 2,
          y: pdfY - elHeightPoints / 2,
          xScale: elWidthPoints / 2,
          yScale: elHeightPoints / 2,
          borderColor: rgb(cr, cg, cb),
          borderWidth: thickness,
        });
      } else if (actualType === 'rectangle') {
        const elWidthPoints = percentToPoints(el.width, pdfWidth);
        const elHeightPoints = percentToPoints(el.height, pdfHeight);
        page.drawRectangle({
          x: pdfX,
          y: pdfY - elHeightPoints,
          width: elWidthPoints,
          height: elHeightPoints,
          borderColor: rgb(cr, cg, cb),
          borderWidth: thickness,
        });
      } else if (actualType === 'line') {
        const x1Points = percentToPoints(el.x1, pdfWidth);
        const y1Points = percentToPoints(el.y1, pdfHeight);
        const x2Points = percentToPoints(el.x2, pdfWidth);
        const y2Points = percentToPoints(el.y2, pdfHeight);
        
        page.drawLine({
          start: { x: x1Points, y: pdfHeight - y1Points },
          end: { x: x2Points, y: pdfHeight - y2Points },
          color: rgb(cr, cg, cb),
          thickness: thickness,
        });
      }
    }

    onProgress?.((i + 1) / elements.length);
  }

  const signedBytes = await pdfDoc.save();
  return new Blob([signedBytes], { type: 'application/pdf' });
}
