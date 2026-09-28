import { PDFDocument } from '@cantoo/pdf-lib';
import { getPdfjs } from './pdfjsLoader.js';
import { getPdfRenderContext } from '../../../lib/pdfRender.js';
import { PDFJS_WASM_URL } from '../../../lib/pdfjsWasm.js';
import { getElementDefinition } from '../../registry/index.ts';
import { blurRadiusPx } from '../../model/blurStrength.ts';
import { pageGeometryFromPdfJsPage } from '../../geometry/coords.ts';
import { readPageGlyphs } from './pageGlyphs.ts';
import { planTextLayer, textLayerReadsBack } from './textLayer.ts';
import { createInvisibleFont, drawInvisibleText } from './invisibleText.js';

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
 * Reads a pdf.js page's glyphs, or null when the page can't be read (a broken
 * content stream). A null page is saved as its picture alone, which is the
 * safe outcome. Glyphs in a font pdf.js never resolved are left out, never
 * placed by guesswork.
 */
async function readGlyphs(pdfjs, pdfjsPage, options) {
  try {
    const operatorList = await pdfjsPage.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
    return readPageGlyphs(operatorList, pdfjs.OPS, (name) => {
      try {
        return pdfjsPage.commonObjs.get(name);
      } catch {
        return null;
      }
    }, options);
  } catch (error) {
    console.error('Redact could not read a page\'s text', error);
    return null;
  }
}

/**
 * Renders one covered page, paints its boxes, and returns the picture as JPEG
 * bytes with the page's geometry.
 */
async function flattenPage(pdfjsPage, pageElements) {
  // Use scale = 2.5 to ensure the flattened image is crisp and readable
  const scale = 2.5;
  const viewport = pdfjsPage.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = getPdfRenderContext(canvas);

  // Render the original PDF page to the canvas
  await pdfjsPage.render({ canvasContext: ctx, viewport }).promise;

  // Each type owns the instruction it contributes to this destructive,
  // page-scoped flatten pass. The registry makes the type decision; this
  // module intentionally only owns PDF-wide canvas/raster orchestration.
  const instructions = pageElements.map((element) =>
    getElementDefinition(element.type).serialize(element, { redaction: true }),
  );

  const placed = instructions.filter(Boolean).map((instruction) => {
    const { element } = instruction;
    return {
      instruction,
      x: (element.left / 100) * viewport.width,
      y: (element.top / 100) * viewport.height,
      w: (element.width / 100) * viewport.width,
      h: (element.height / 100) * viewport.height,
    };
  });
  const solids = placed.filter(({ instruction }) => instruction.kind !== 'blur');
  const blurs = placed.filter(({ instruction }) => instruction.kind === 'blur');
  const paintSolids = () => {
    for (const { instruction, x, y, w, h } of solids) {
      ctx.fillStyle = instruction.element.color || '#000000';
      ctx.fillRect(x, y, w, h);
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
    for (const { instruction, x, y, w, h } of blurs) {
      const radius = blurRadiusPx(instruction.element.strength, h);
      const { canvas: blurred, sx, sy } = buildBoxBlur(source, x, y, w, h, radius);
      ctx.drawImage(blurred, x - sx, y - sy, w, h, x, y, w, h);
    }
    paintSolids();
  }

  // Convert canvas to high-quality JPEG
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  return dataUrl.split(',')[1];
}

/**
 * Writes the output document: untouched pages copied losslessly, covered
 * pages as their picture plus, unless listed in `pictureOnly`, the invisible
 * text of every word no box reaches (RED-12).
 */
async function assemble(sourceDoc, covered, pictureOnly) {
  const newDoc = await PDFDocument.create();
  let font = null;
  for (let i = 0; i < sourceDoc.getPageCount(); i++) {
    const page = covered.get(i);
    if (!page) {
      const [copiedPage] = await newDoc.copyPages(sourceDoc, [i]);
      newDoc.addPage(copiedPage);
      continue;
    }
    const { width, height } = page.geometry;
    const newPage = newDoc.addPage([width, height]);
    newPage.drawImage(await newDoc.embedJpg(page.jpeg), { x: 0, y: 0, width, height });
    if (page.plan && page.plan.runs.length > 0 && !pictureOnly.has(i)) {
      font ??= createInvisibleFont(newDoc);
      drawInvisibleText(newDoc, newPage, font, page.plan.runs);
    }
  }
  font?.finish();
  return newDoc.save();
}

/**
 * RED-09: reads the saved file back and returns the covered pages whose text
 * layer is not exactly what was planned: any glyph under a box, or any word
 * missing or added. Fails closed: a page that can't be read back fails too.
 */
async function pagesFailingReadBack(pdfjs, bytes, covered, pictureOnly) {
  const failed = [];
  const check = [...covered.entries()].filter(([i, page]) => page.plan && page.plan.runs.length > 0 && !pictureOnly.has(i));
  if (check.length === 0) return failed;
  const loadingTask = pdfjs.getDocument({ data: bytes.slice(), wasmUrl: PDFJS_WASM_URL });
  try {
    const savedDoc = await loadingTask.promise;
    for (const [i, page] of check) {
      // The saved page has its own geometry: the picture's size, unrotated.
      const savedPage = await savedDoc.getPage(i + 1);
      const glyphs = await readGlyphs(pdfjs, savedPage, { invisibleText: true });
      const savedGeometry = pageGeometryFromPdfJsPage(savedPage);
      if (!glyphs || !textLayerReadsBack(page.plan, glyphs, savedGeometry, page.boxes)) failed.push(i);
    }
  } catch (error) {
    console.error('Redact could not read the saved file back', error);
    return check.map(([i]) => i);
  } finally {
    await loadingTask.destroy();
  }
  return failed;
}

/**
 * Applies redactions to a PDF. A page with a Blur, Blackout or Whiteout box is
 * saved as a picture with the boxes painted in, so nothing under a box
 * survives; over the picture goes invisible text for every word no box
 * reaches, so the rest of the page can still be selected and searched
 * (RED-12). The saved file is read back, and a page whose text layer is not
 * exactly as planned is saved again as the picture alone (RED-09). Pages with
 * no box are copied losslessly.
 *
 * @param {File|Blob} file - The original PDF file
 * @param {Array} elements - Array of redaction box objects { pageIndex, left, top, width, height } in percentages
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<{ blob: Blob, pictureOnlyPages: number[] }>} The processed
 *   PDF, and the zero-based pages saved as a picture alone although they had
 *   text, which the person is told about.
 */
export async function redactPdf(file, elements, onProgress) {
  const bytes = await file.arrayBuffer();
  const sourceDoc = await PDFDocument.load(bytes);

  // We need pdf.js to render pages to an image canvas for flattening
  const pdfjs = await getPdfjs();
  const loadingTask = pdfjs.getDocument({ data: bytes.slice(0), wasmUrl: PDFJS_WASM_URL });
  const pdfjsDoc = await loadingTask.promise;

  const covered = new Map();
  const pictureOnly = new Set();
  const pageCount = sourceDoc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const pageElements = elements.filter((el) => el.pageIndex === i);
    if (pageElements.length > 0) {
      const pdfjsPage = await pdfjsDoc.getPage(i + 1);
      const jpeg = await flattenPage(pdfjsPage, pageElements);
      const geometry = pageGeometryFromPdfJsPage(pdfjsPage);
      const boxes = pageElements.map(({ left, top, width, height }) => ({ left, top, width, height }));
      const glyphs = await readGlyphs(pdfjs, pdfjsPage);
      let plan = null;
      if (glyphs === null) {
        pictureOnly.add(i);
      } else {
        try {
          plan = planTextLayer(glyphs, geometry, boxes);
        } catch (error) {
          console.error('Redact could not plan a page\'s text', error);
          pictureOnly.add(i);
        }
      }
      covered.set(i, { jpeg, geometry, boxes, plan });
    }
    onProgress?.((i + 1) / pageCount);
  }
  await loadingTask.destroy();

  let redactedBytes = await assemble(sourceDoc, covered, pictureOnly);
  const failed = await pagesFailingReadBack(pdfjs, redactedBytes, covered, pictureOnly);
  if (failed.length > 0) {
    failed.forEach((i) => pictureOnly.add(i));
    redactedBytes = await assemble(sourceDoc, covered, pictureOnly);
  }

  return {
    blob: new Blob([redactedBytes], { type: 'application/pdf' }),
    pictureOnlyPages: [...pictureOnly].sort((a, b) => a - b),
  };
}
