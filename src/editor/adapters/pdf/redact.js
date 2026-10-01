import { PDFDocument } from '@cantoo/pdf-lib';
import { getPdfjs } from './pdfjsLoader.js';
import { PDFJS_WASM_URL } from '../../../lib/pdfjsWasm.js';
import { getElementDefinition } from '../../registry/index.ts';
import { blurRadiusPx } from '../../model/blurStrength.ts';
import { RASTER_SCALE, rasterizePageToJpeg, buildImageOnlyPage } from './rasterPage.js';
import { strokeInPixels } from '../../model/strokeGeometry.ts';

/**
 * Builds a blurred copy of one box's source region, opaque even where the
 * blur reaches past the page edge.
 *
 * The radius depends on the box's own height (see blurStrength.ts), so each
 * box needs its own blurred canvas rather than one shared per-page blur. The
 * source rect is grown by a margin on every side because a blur needs
 * surrounding pixels to draw from; without the margin the box's edges would
 * blur toward nothing and look lighter than its center. The temp canvas is
 * filled opaque white before drawing so the pasted result is fully opaque
 * even at the page edge, where the grown source rect runs off the original
 * canvas and would otherwise leave semi-transparent pixels showing the
 * (unblurred) page underneath.
 */
function buildBoxBlur(original, x, y, w, h, radius) {
  const margin = Math.ceil(3 * radius);
  const sx = Math.max(0, x - margin);
  const sy = Math.max(0, y - margin);
  const sw = Math.min(original.width, x + w + margin) - sx;
  const sh = Math.min(original.height, y + h + margin) - sy;

  const temp = document.createElement('canvas');
  temp.width = sw;
  temp.height = sh;
  const tctx = temp.getContext('2d');
  tctx.fillStyle = '#ffffff';
  tctx.fillRect(0, 0, sw, sh);
  tctx.filter = `blur(${radius}px)`;
  tctx.drawImage(original, sx, sy, sw, sh, 0, 0, sw, sh);

  return { canvas: temp, sx, sy };
}

/**
 * Traces a brush stroke on a 2D context: round caps and joins at the brush
 * diameter, the same shape the screen draws (redactionSurface.ts). `dx`/`dy`
 * shift the path, for painting into a piece canvas cut from the page. A
 * stroke of one spot (or every point the same) is a filled disc, so a tap is
 * a dot whatever the canvas implementation does with zero-length lines.
 */
function traceStroke(ctx, stroke, dx = 0, dy = 0) {
  const { points, diameter } = stroke;
  ctx.lineWidth = diameter;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const [fx, fy] = points[0];
  if (points.every(([px, py]) => px === fx && py === fy)) {
    ctx.beginPath();
    ctx.arc(fx + dx, fy + dy, diameter / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(fx + dx, fy + dy);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0] + dx, points[i][1] + dy);
  ctx.stroke();
}

/**
 * Builds a stroke's blur: the blurred source clipped to the stroke shape, in
 * a piece canvas the size of the stroke's bbox. The radius is the blur rule
 * applied to the brush diameter, as on screen.
 */
function buildStrokeBlur(source, stroke, strength, scale) {
  const { x, y, w, h } = stroke;
  const radius = blurRadiusPx(strength, stroke.diameter, scale);
  const { canvas: blurred, sx, sy } = buildBoxBlur(source, x, y, w, h, radius);
  const piece = document.createElement('canvas');
  piece.width = Math.max(1, Math.ceil(w));
  piece.height = Math.max(1, Math.ceil(h));
  const pctx = piece.getContext('2d');
  pctx.drawImage(blurred, x - sx, y - sy, w, h, 0, 0, w, h);
  // Keep the blurred pixels only where the brush passed.
  pctx.globalCompositeOperation = 'destination-in';
  pctx.fillStyle = '#000000';
  pctx.strokeStyle = '#000000';
  traceStroke(pctx, stroke, -x, -y);
  return piece;
}

/**
 * Renders one covered page, paints its boxes, and returns the picture as JPEG
 * bytes with the page's geometry.
 */
async function flattenPage(pdfjsPage, pageElements) {
  return rasterizePageToJpeg(pdfjsPage, {
    paint: (ctx, viewport, canvas) => paintBoxes(ctx, viewport, canvas, pageElements),
  });
}

/** Paints the page's redaction boxes onto its rendered canvas. */
function paintBoxes(ctx, viewport, canvas, pageElements) {
  const scale = RASTER_SCALE;

  // Each type owns the instruction it contributes to this destructive,
  // page-scoped flatten pass. The registry makes the type decision; this
  // module intentionally only owns PDF-wide canvas/raster orchestration.
  const instructions = pageElements.map((element) =>
    getElementDefinition(element.type).serialize(element, { redaction: true }),
  );

  const placed = instructions.filter(Boolean).map((instruction) => {
    const { element } = instruction;
    // RED-32: a brush stroke carries its points; every other element is a box.
    const stroke = Array.isArray(element.points)
      ? strokeInPixels(element, viewport.width, viewport.height, scale)
      : null;
    return {
      instruction,
      stroke,
      x: (element.left / 100) * viewport.width,
      y: (element.top / 100) * viewport.height,
      w: (element.width / 100) * viewport.width,
      h: (element.height / 100) * viewport.height,
    };
  });
  const solids = placed.filter(({ instruction }) => instruction.kind !== 'blur');
  const blurs = placed.filter(({ instruction }) => instruction.kind === 'blur');
  const paintSolids = () => {
    for (const { instruction, stroke, x, y, w, h } of solids) {
      const color = instruction.element.color || '#000000';
      ctx.fillStyle = color;
      if (stroke) {
        ctx.strokeStyle = color;
        traceStroke(ctx, stroke);
      } else {
        ctx.fillRect(x, y, w, h);
      }
    }
  };

  // Solid boxes are painted before a blur samples the page and again after
  // every blur, whatever order the boxes were drawn in. A blur overlapping a
  // Blackout used to paste the original, blurred, back over it: it sampled
  // the page before any box, secret included. Now a blur only ever sees
  // what the solid boxes left, and a solid box always ends on top.
  paintSolids();
  if (blurs.length > 0) {
    // A blur box's radius is a fraction of its OWN height (blurStrength.ts),
    // so boxes can't share one page-wide blurred canvas. One snapshot, taken
    // after the solid boxes and before any blur, is every blur's source, so
    // overlapping blurs don't blur each other twice.
    const source = document.createElement('canvas');
    source.width = canvas.width;
    source.height = canvas.height;
    source.getContext('2d').drawImage(canvas, 0, 0);
    for (const { instruction, stroke, x, y, w, h } of blurs) {
      if (stroke) {
        const piece = buildStrokeBlur(source, stroke, instruction.element.strength, scale);
        ctx.drawImage(piece, x, y);
        continue;
      }
      const radius = blurRadiusPx(instruction.element.strength, h, scale);
      const { canvas: blurred, sx, sy } = buildBoxBlur(source, x, y, w, h, radius);
      ctx.drawImage(blurred, x - sx, y - sy, w, h, x, y, w, h);
    }
    paintSolids();
  }
}

/**
 * Writes the output document: untouched pages copied losslessly, covered
 * pages saved as their picture alone, with no text layer.
 */
async function assemble(sourceDoc, covered) {
  const newDoc = await PDFDocument.create();
  for (let i = 0; i < sourceDoc.getPageCount(); i++) {
    const page = covered.get(i);
    if (!page) {
      const [copiedPage] = await newDoc.copyPages(sourceDoc, [i]);
      newDoc.addPage(copiedPage);
      continue;
    }
    await buildImageOnlyPage(newDoc, page.jpeg, page.width, page.height);
  }
  return newDoc.save();
}

/**
 * Applies redactions to a PDF. A page with a Blur, Blackout or Whiteout box
 * or brush stroke is saved as one picture with them painted in, so nothing under a box
 * survives, and with no text layer at all. Pages with no box are copied
 * losslessly.
 *
 * @param {File|Blob} file - The original PDF file
 * @param {Array} elements - Array of redaction box objects { pageIndex, left, top, width, height } in percentages
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<{ blob: Blob }>} The processed PDF.
 */
export async function redactPdf(file, elements, onProgress) {
  const bytes = await file.arrayBuffer();
  const sourceDoc = await PDFDocument.load(bytes);

  // We need pdf.js to render pages to an image canvas for flattening
  const pdfjs = await getPdfjs();
  const loadingTask = pdfjs.getDocument({ data: bytes.slice(0), wasmUrl: PDFJS_WASM_URL });
  const pdfjsDoc = await loadingTask.promise;

  const covered = new Map();
  const pageCount = sourceDoc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const pageElements = elements.filter((el) => el.pageIndex === i);
    if (pageElements.length > 0) {
      const pdfjsPage = await pdfjsDoc.getPage(i + 1);
      covered.set(i, await flattenPage(pdfjsPage, pageElements));
    }
    onProgress?.((i + 1) / pageCount);
  }
  await loadingTask.destroy();

  const redactedBytes = await assemble(sourceDoc, covered);

  return { blob: new Blob([redactedBytes], { type: 'application/pdf' }) };
}
