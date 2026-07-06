import { PDFDocument, rgb, LineCapStyle } from '@cantoo/pdf-lib';
// Note: @pdf-lib/fontkit is intentionally not imported. Text is rendered via
// the browser's native shaping engine (canvas API / HarfBuzz) and embedded as
// a PNG image, which correctly applies OpenType GPOS/GSUB features for complex
// scripts like Hebrew and Arabic. pdf-lib's page.drawText() ignores those
// tables and places glyphs at raw advance widths, causing the inter-letter gaps
// visible in RTL/complex-script fonts.
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

// Renders a text element to an offscreen canvas using the browser's native text
// shaping engine (HarfBuzz in Chrome/Firefox/Safari), then returns a PNG data URL
// and the image dimensions in PDF points.
//
// Super-sampling at 3× means the rasterized text is still crisp at the zoom
// levels (100–400%) used in most PDF viewers. The padding values mirror the
// editor's CSS so vertical placement in the PDF matches the editor preview.
async function renderTextToImage(el, fontSizeInPoints) {
  const SCALE = 3;
  const lines = (el.text || '').trim().split(/\r?\n/);
  const isRtl = getEffectiveTextDirection(el) === 'rtl';
  const fontFamily = el.fontFamily || 'Arimo';
  const fontWeight = el.fontWeight || 'normal';
  const fontStyle = el.fontStyle || 'normal';

  const fontPx = fontSizeInPoints * SCALE;
  const fontStr = `${fontStyle} ${fontWeight} ${fontPx}px "${fontFamily}"`;

  // Ensure the @font-face font is fully loaded before the canvas measures it.
  try { await document.fonts.load(fontStr); } catch { /* fall through to system font */ }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = fontStr;

  const lineHeightPx = fontPx * 1.2;           // matches CSS line-height: 1.2
  const paddingTopPx = Math.round(fontPx * 0.3); // matches TEXT_BOX_PADDING_EM = 0.3

  const maxLineWidthPx = Math.max(1, ...lines.map(l => ctx.measureText(l).width));
  // +2px so right-edge glyphs (e.g. italic f, j) don't clip against the canvas edge.
  canvas.width  = Math.ceil(maxLineWidthPx) + 2;
  canvas.height = Math.ceil(paddingTopPx + lineHeightPx * lines.length);

  // Canvas state resets on resize — re-apply everything.
  ctx.font        = fontStr;
  ctx.fillStyle   = el.color || '#000000';
  ctx.textBaseline = 'top';
  ctx.direction   = isRtl ? 'rtl' : 'ltr';

  lines.forEach((line, i) => {
    // RTL: anchor text against the right edge so it aligns correctly.
    const x = isRtl ? canvas.width - 1 : 1;
    ctx.fillText(line, x, paddingTopPx + i * lineHeightPx);
  });

  return {
    dataUrl:      canvas.toDataURL('image/png'),
    widthPoints:  canvas.width  / SCALE,  // canvas was rendered at SCALE px/pt
    heightPoints: canvas.height / SCALE,
  };
}

// Bakes placed text/symbol/signature elements into the PDF and returns the
// signed result as a Blob. Runs entirely in-memory in the browser - no network
// I/O except fetching bundled custom fonts from same-origin /fonts/.
export async function signPdf(file, elements, onProgress) {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const page = pdfDoc.getPage(el.pageIndex);
    const { width: pdfWidth, height: pdfHeight } = page.getSize();

    // Map screen percentages to PDF points
    const pdfX = percentToPoints(el.left, pdfWidth);
    const pdfY = pdfHeight - percentToPoints(el.top, pdfHeight);

    if (el.type === 'text') {
      const textValue = (el.text || '').trim();
      if (!textValue) continue;

      // Render via the browser's native shaping engine (HarfBuzz) so that
      // OpenType GPOS/GSUB features — kerning, contextual alternates, etc. —
      // are applied correctly for any script. page.drawText() ignores those
      // tables and produces visible gaps in Hebrew/Arabic fonts.
      const rendered = await renderTextToImage(el, el.fontSize || 12);
      const base64Data = rendered.dataUrl.split(',')[1];
      const embeddedImage = await pdfDoc.embedPng(base64Data);

      // el.left is the RIGHT edge for RTL text (the editor anchors RTL boxes by
      // their right edge; see DraggableOverlayElement.jsx). Adjust x accordingly.
      const isRtl = getEffectiveTextDirection(el) === 'rtl';
      const imgX = isRtl ? pdfX - rendered.widthPoints : pdfX;
      // pdfY is the element's top edge; pdf-lib drawImage y is the bottom-left corner.
      page.drawImage(embeddedImage, {
        x: imgX,
        y: pdfY - rendered.heightPoints,
        width:  rendered.widthPoints,
        height: rendered.heightPoints,
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
