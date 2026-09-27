// RED-01 spike: true (content-level) redaction using PDFium compiled to
// WebAssembly (@embedpdf/pdfium), driven directly through its low-level
// FPDF_* C API (no high-level wrapper).
//
// For each corpus entry:
//  - load the PDF, load the target page and its text page
//  - convert the corpus rect (top-left-origin %, in *rendered* / rotated
//    device space, matching src/editor/geometry/coords.ts) into PDF user
//    space via FPDF_DeviceToPage, which already accounts for /Rotate and the
//    page's display box the same way pdf.js's viewport did when the corpus
//    rect was captured
//  - walk every page object (FPDFPage_CountObjects / GetObject / GetType)
//  - TEXT objects: classify per character via the page's text page
//    (FPDFText_GetCharBox + FPDFText_GetTextObject to know which object each
//    character belongs to). An object fully inside the rect is removed
//    outright (FPDFPage_RemoveObject). An object with *some* characters
//    inside and some outside is split: the original is removed and each
//    maximal run of surviving characters is rebuilt as a new text object
//    (FPDFPageObj_CreateTextObj + FPDFText_SetText) positioned with the
//    original object's matrix (rotation/scale) translated to that run's
//    first-character origin (FPDFText_GetCharOrigin) - never re-fetched
//    mid-loop, computed once per run up front (see the embedpdf #801 note
//    below).
//  - IMAGE objects: fully-inside -> removed; overlapping -> the intersecting
//    pixel rows/columns are painted black in the image's own bitmap
//    (FPDFImageObj_GetBitmap / FPDFBitmap_GetBuffer, then
//    FPDFImageObj_SetBitmap to commit it back).
//  - PATH objects: fully-inside -> removed; overlapping -> reported only
//    (see results.md; the corpus does not exercise a true partial-path
//    case, and PDFium exposes no analogous "trim this path to a rect"
//    primitive - only re-authoring the path's point list would do it).
//  - FORM XObjects: reported on separately (see inspectFormXObject below);
//    not exercised by the corpus (no fixture nests text inside a Form
//    XObject that also needs partial redaction), but the traversal is
//    written generically so it would recurse if one existed.
//  - FPDFPage_GenerateContent, then FPDF_SaveAsCopy via the PDFiumExt_*
//    file-writer helpers (there is no virtual filesystem in this Node build,
//    so the classic FPDF_FILEWRITE callback dance is replaced by this
//    package's own in-memory-writer extension).
//
// KNOWN EMBEDPDF BUG (#801): FPDFPageObj_GetMatrix/GetCharOrigin must be
// read for a run *before* any FPDFPage_RemoveObject/FPDFPageObj_SetMatrix
// call touches that page's objects - mutating the text matrix mid-glyph-loop
// corrupts subsequent reads. This engine reads every char's box, origin and
// owning object up front for the whole page in one pass, and only mutates
// objects (remove / insert) in a second pass, after all reads are done.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { init } from '@embedpdf/pdfium';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FPDF_PAGEOBJ_TEXT = 1;
const FPDF_PAGEOBJ_PATH = 2;
const FPDF_PAGEOBJ_IMAGE = 3;
const FPDF_PAGEOBJ_SHADING = 4;
const FPDF_PAGEOBJ_FORM = 5;

let pdfiumModulePromise = null;
export async function loadPdfium() {
  if (!pdfiumModulePromise) {
    pdfiumModulePromise = (async () => {
      const wasmPath = path.join(__dirname, 'node_modules/@embedpdf/pdfium/dist/pdfium.wasm');
      const wasmBinary = fs.readFileSync(wasmPath);
      const m = await init({ wasmBinary });
      m.FPDF_InitLibrary();
      m.PDFiumExt_Init();
      return m;
    })();
  }
  return pdfiumModulePromise;
}

// ---------------------------------------------------------------------------
// Small malloc/free-scoped helpers over the wasm heap.
// ---------------------------------------------------------------------------
function withScratch(m, sizes, fn) {
  const ptrs = sizes.map((s) => m.pdfium.wasmExports.malloc(s));
  try {
    return fn(...ptrs);
  } finally {
    for (const p of ptrs) m.pdfium.wasmExports.free(p);
  }
}

function readDouble(m, ptr) {
  return m.pdfium.getValue(ptr, 'double');
}
function readFloat(m, ptr) {
  return m.pdfium.getValue(ptr, 'float');
}

/** UTF16LE-encode `str` into a fresh wasm buffer (NUL-terminated); caller frees. */
function allocUtf16(m, str) {
  const byteLen = (str.length + 1) * 2;
  const ptr = m.pdfium.wasmExports.malloc(byteLen);
  m.pdfium.stringToUTF16(str, ptr, byteLen);
  return ptr;
}

// ---------------------------------------------------------------------------
// Rect conversion: corpus rect (%, top-left origin, rendered/rotated device
// space, matching pdf.js's getViewport({rotation: page.rotate})) -> PDF
// user-space (raw, UNROTATED mediabox frame - the same frame
// FPDFPageObj_GetBounds / FPDFText_GetCharBox report in).
//
// NOTE: FPDF_DeviceToPage/FPDF_PageToDevice were tried first and do NOT work
// for this: empirically (see spike debugging), their "page" coordinate is
// not the raw mediabox frame that GetBounds/GetCharBox use - round-tripping
// a known glyph's raw box through FPDF_PageToDevice with rotate=page
// rotation produced a device rect with the wrong aspect ratio entirely, not
// just an off-by-a-bit error. So this converts by hand, using the classical
// four-case /Rotate transform (verified against this corpus's own
// page-rotate-90.pdf fixture: the derived PDF-space rect lines up with the
// actual glyph boxes read via FPDFText_GetCharBox for that fixture).
// ---------------------------------------------------------------------------
function corpusRectToPdfSpace(m, page, rectPct) {
  const [leftPct, topPct, wPct, hPct] = rectPct;
  const devW = m.FPDF_GetPageWidth(page); // rotated/displayed width
  const devH = m.FPDF_GetPageHeight(page); // rotated/displayed height
  const rotation = ((m.FPDFPage_GetRotation(page) % 4) + 4) % 4; // 0..3 = 0/90/180/270 clockwise

  const { left: x0, bottom: y0, right: x1, top: y1 } = getMediaBox(m, page);

  const dx0 = (leftPct / 100) * devW;
  const dy0 = (topPct / 100) * devH;
  const dx1 = dx0 + (wPct / 100) * devW;
  const dy1 = dy0 + (hPct / 100) * devH;

  // Inverse of the device(dx,dy) <- PDF(x,y) mapping for each /Rotate case
  // (dx,dy origin top-left, y-down; PDF x,y origin bottom-left, y-up).
  const toPdf = (dx, dy) => {
    switch (rotation) {
      case 0:
        return { x: dx + x0, y: y1 - dy };
      case 1: // 90 clockwise
        return { x: dy + x0, y: dx + y0 };
      case 2:
        return { x: x1 - dx, y: dy + y0 };
      case 3: // 270 clockwise (90 CCW)
        return { x: x1 - dy, y: y1 - dx };
      default:
        throw new Error(`unreachable rotation ${rotation}`);
    }
  };

  const corners = [toPdf(dx0, dy0), toPdf(dx1, dy0), toPdf(dx0, dy1), toPdf(dx1, dy1)];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    bottom: Math.min(...ys),
    top: Math.max(...ys),
  };
}

function getMediaBox(m, page) {
  // FS_RECTF is one struct of 4 consecutive floats (left, top, right,
  // bottom) - must be a single 16-byte allocation, not 4 separate ones.
  return withScratch(m, [16], (rectPtr) => {
    const ok = m.FPDF_GetPageBoundingBox(page, rectPtr);
    if (!ok) return { left: 0, bottom: 0, right: m.FPDF_GetPageWidth(page), top: m.FPDF_GetPageHeight(page) };
    const left = readFloat(m, rectPtr);
    const top = readFloat(m, rectPtr + 4);
    const right = readFloat(m, rectPtr + 8);
    const bottom = readFloat(m, rectPtr + 12);
    return { left, bottom, right, top };
  });
}

function rectsIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
}
function rectFullyInside(inner, outer) {
  return inner.left >= outer.left && inner.right <= outer.right && inner.bottom >= outer.bottom && inner.top <= outer.top;
}

function getObjBounds(m, obj) {
  return withScratch(m, [4, 4, 4, 4], (lPtr, bPtr, rPtr, tPtr) => {
    const ok = m.FPDFPageObj_GetBounds(obj, lPtr, bPtr, rPtr, tPtr);
    if (!ok) return null;
    return {
      left: readFloat(m, lPtr),
      bottom: readFloat(m, bPtr),
      right: readFloat(m, rPtr),
      top: readFloat(m, tPtr),
    };
  });
}

// ---------------------------------------------------------------------------
// Text-object redaction.
// ---------------------------------------------------------------------------

/**
 * Reads, for the whole page, one entry per character: { objPtr, box, origin,
 * unicode }. This is the "read everything up front" pass required to avoid
 * embedpdf#801 (never mutate a text matrix mid-glyph-loop).
 */
function readAllChars(m, textPage) {
  const count = m.FPDFText_CountChars(textPage);
  const chars = [];
  withScratch(m, [8, 8, 8, 8, 8, 8], (lPtr, rPtr, bPtr, tPtr, xPtr, yPtr) => {
    for (let i = 0; i < count; i++) {
      const objPtr = m.FPDFText_GetTextObject(textPage, i);
      const gotBox = m.FPDFText_GetCharBox(textPage, i, lPtr, rPtr, bPtr, tPtr);
      const gotOrigin = m.FPDFText_GetCharOrigin(textPage, i, xPtr, yPtr);
      const unicode = m.FPDFText_GetUnicode(textPage, i);
      chars.push({
        index: i,
        objPtr,
        box: gotBox
          ? { left: readDouble(m, lPtr), right: readDouble(m, rPtr), bottom: readDouble(m, bPtr), top: readDouble(m, tPtr) }
          : null,
        origin: gotOrigin ? { x: readDouble(m, xPtr), y: readDouble(m, yPtr) } : null,
        unicode,
      });
    }
  });
  return chars;
}

function getMatrix(m, obj) {
  // FS_MATRIX: a,b,c,d,e,f as 6 consecutive floats.
  return withScratch(m, [24], (matPtr) => {
    const ok = m.FPDFPageObj_GetMatrix(obj, matPtr);
    if (!ok) return null;
    return {
      a: readFloat(m, matPtr),
      b: readFloat(m, matPtr + 4),
      c: readFloat(m, matPtr + 8),
      d: readFloat(m, matPtr + 12),
      e: readFloat(m, matPtr + 16),
      f: readFloat(m, matPtr + 20),
    };
  });
}
function setMatrix(m, obj, mat) {
  withScratch(m, [24], (matPtr) => {
    m.pdfium.setValue(matPtr, mat.a, 'float');
    m.pdfium.setValue(matPtr + 4, mat.b, 'float');
    m.pdfium.setValue(matPtr + 8, mat.c, 'float');
    m.pdfium.setValue(matPtr + 12, mat.d, 'float');
    m.pdfium.setValue(matPtr + 16, mat.e, 'float');
    m.pdfium.setValue(matPtr + 20, mat.f, 'float');
    m.FPDFPageObj_SetMatrix(obj, matPtr);
  });
}

/**
 * Redacts text objects on `page` intersecting `targetRect` (PDF space).
 * Returns { removed, rebuilt, partialObjects } counts for reporting.
 */
function redactTextObjects(m, doc, page, textPage, targetRect) {
  const chars = readAllChars(m, textPage);

  // Group characters by owning text object, preserving char order.
  const byObj = new Map();
  for (const ch of chars) {
    if (!ch.objPtr) continue;
    if (!byObj.has(ch.objPtr)) byObj.set(ch.objPtr, []);
    byObj.get(ch.objPtr).push(ch);
  }

  let removedFully = 0;
  let rebuiltPartial = 0;
  let untouched = 0;
  const toRemove = [];
  const toInsert = [];

  for (const [objPtr, objChars] of byObj) {
    const insideFlags = objChars.map((c) => (c.box ? rectFullyInside(c.box, targetRect) : false));
    const anyInside = insideFlags.some(Boolean);
    const allInside = insideFlags.every(Boolean);

    if (!anyInside) {
      untouched++;
      continue;
    }
    if (allInside) {
      toRemove.push(objPtr);
      removedFully++;
      continue;
    }

    // Partial: rebuild surviving runs. Read everything needed (matrix, font,
    // font size) BEFORE any mutation, per the #801 note above.
    const origMatrix = getMatrix(m, objPtr) || { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const fontHandle = m.FPDFTextObj_GetFont(objPtr);
    const fontSize = withScratch(m, [4], (szPtr) => {
      const ok = m.FPDFTextObj_GetFontSize(objPtr, szPtr);
      return ok ? readFloat(m, szPtr) : 12;
    });

    const runs = [];
    let cur = null;
    for (let i = 0; i < objChars.length; i++) {
      if (!insideFlags[i]) {
        if (!cur) {
          cur = { chars: [] };
          runs.push(cur);
        }
        cur.chars.push(objChars[i]);
      } else {
        cur = null;
      }
    }

    for (const run of runs) {
      if (run.chars.length === 0) continue;
      const text = run.chars.map((c) => String.fromCodePoint(c.unicode || 0x20)).join('');
      const origin = run.chars[0].origin;
      toInsert.push({ text, origin, matrix: origMatrix, fontHandle, fontSize });
    }
    toRemove.push(objPtr);
    rebuiltPartial++;
  }

  for (const objPtr of toRemove) {
    m.FPDFPage_RemoveObject(page, objPtr);
  }
  for (const spec of toInsert) {
    const newObj = m.FPDFPageObj_CreateTextObj(doc, spec.fontHandle, spec.fontSize);
    const textPtr = allocUtf16(m, spec.text);
    m.FPDFText_SetText(newObj, textPtr);
    m.pdfium.wasmExports.free(textPtr);
    const mat = { ...spec.matrix };
    if (spec.origin) {
      mat.e = spec.origin.x;
      mat.f = spec.origin.y;
    }
    setMatrix(m, newObj, mat);
    m.FPDFPage_InsertObject(page, newObj);
  }

  return { removedFully, rebuiltPartial, untouched };
}

// ---------------------------------------------------------------------------
// Image-object redaction: paint the overlapping pixel region black, or
// remove the object outright if the rect fully covers it.
// ---------------------------------------------------------------------------
function redactImageObject(m, page, obj, targetRect) {
  const bounds = getObjBounds(m, obj);
  if (!bounds) return 'skipped-no-bounds';
  if (!rectsIntersect(bounds, targetRect)) return 'untouched';
  if (rectFullyInside(bounds, targetRect)) {
    m.FPDFPage_RemoveObject(page, obj);
    return 'removed';
  }

  // Partial: paint the intersecting region black in image pixel space.
  // The image's unit square [0,1]x[0,1] is mapped to PDF space by its
  // matrix; since every corpus image fixture uses an axis-aligned
  // (non-rotated) matrix, inverting that mapping to pixel columns/rows is a
  // plain affine divide - a rotated image would need the full inverse
  // matrix, which this spike does not attempt.
  const mat = getMatrix(m, obj);
  const bitmap = m.FPDFImageObj_GetBitmap(obj);
  if (!bitmap) return 'no-bitmap';
  const w = m.FPDFBitmap_GetWidth(bitmap);
  const h = m.FPDFBitmap_GetHeight(bitmap);
  const stride = m.FPDFBitmap_GetStride(bitmap);
  const bufPtr = m.FPDFBitmap_GetBuffer(bitmap);
  const format = m.FPDFBitmap_GetFormat(bitmap);
  const bytesPerPixel = format === 4 ? 4 : format === 3 ? 4 : format === 2 ? 3 : 1;

  const inter = {
    left: Math.max(bounds.left, targetRect.left),
    right: Math.min(bounds.right, targetRect.right),
    bottom: Math.max(bounds.bottom, targetRect.bottom),
    top: Math.min(bounds.top, targetRect.top),
  };
  // Map PDF-space intersection back to unit-square fractions using the
  // object's own bounds (axis-aligned assumption noted above), then to pixel
  // rows/cols (bitmap row 0 is the top of the image).
  const fracLeft = (inter.left - bounds.left) / (bounds.right - bounds.left);
  const fracRight = (inter.right - bounds.left) / (bounds.right - bounds.left);
  const fracTop = (bounds.top - inter.top) / (bounds.top - bounds.bottom);
  const fracBottom = (bounds.top - inter.bottom) / (bounds.top - bounds.bottom);
  const colStart = Math.max(0, Math.floor(fracLeft * w));
  const colEnd = Math.min(w, Math.ceil(fracRight * w));
  const rowStart = Math.max(0, Math.floor(fracTop * h));
  const rowEnd = Math.min(h, Math.ceil(fracBottom * h));

  const heap = m.pdfium.HEAPU8;
  for (let row = rowStart; row < rowEnd; row++) {
    const rowBase = bufPtr + row * stride;
    for (let col = colStart; col < colEnd; col++) {
      const px = rowBase + col * bytesPerPixel;
      for (let b = 0; b < bytesPerPixel; b++) {
        // Leave alpha (last byte of a 4-byte BGRA pixel) untouched; zero RGB.
        const isAlpha = bytesPerPixel === 4 && b === 3;
        heap[px + b] = isAlpha ? heap[px + b] : 0;
      }
    }
  }
  const setOk = m.FPDFImageObj_SetBitmap(0, 0, obj, bitmap);
  void mat;
  return setOk ? 'painted' : 'paint-failed';
}

// ---------------------------------------------------------------------------
// Path-object redaction: remove if fully inside, otherwise report (no
// primitive to trim a path's point list to a rect is used here).
// ---------------------------------------------------------------------------
function redactPathObject(m, page, obj, targetRect) {
  const bounds = getObjBounds(m, obj);
  if (!bounds) return 'skipped-no-bounds';
  if (!rectsIntersect(bounds, targetRect)) return 'untouched';
  if (rectFullyInside(bounds, targetRect)) {
    m.FPDFPage_RemoveObject(page, obj);
    return 'removed';
  }
  return 'partial-reported-only';
}

// ---------------------------------------------------------------------------
// Form XObject inspection (reporting only - not exercised by the corpus).
// ---------------------------------------------------------------------------
function inspectFormXObject(m, obj) {
  const count = m.FPDFFormObj_CountObjects(obj);
  return { innerObjectCount: count };
}

// ---------------------------------------------------------------------------
// Whole-document redaction entry point.
// ---------------------------------------------------------------------------
export async function redactPdf(bytes, entry) {
  const m = await loadPdfium();
  const ptr = m.pdfium.wasmExports.malloc(bytes.length);
  m.pdfium.HEAPU8.set(bytes, ptr);
  const doc = m.FPDF_LoadMemDocument64(ptr, bytes.length, '');
  if (!doc) throw new Error(`FPDF_LoadMemDocument64 failed for ${entry.file}: err=${m.FPDF_GetLastError()}`);

  const pageIndex = entry.page - 1;
  const page = m.FPDF_LoadPage(doc, pageIndex);
  if (!page) throw new Error(`FPDF_LoadPage failed for ${entry.file} page ${entry.page}`);

  const targetRect = corpusRectToPdfSpace(m, page, entry.rect);
  const textPage = m.FPDFText_LoadPage(page);

  const report = {
    file: entry.file,
    textRemovedFully: 0,
    textRebuiltPartial: 0,
    imageOutcomes: [],
    pathOutcomes: [],
    formXObjects: [],
  };

  if (textPage) {
    const r = redactTextObjects(m, doc, page, textPage, targetRect);
    report.textRemovedFully = r.removedFully;
    report.textRebuiltPartial = r.rebuiltPartial;
    m.FPDFText_ClosePage(textPage);
  }

  // Re-enumerate objects fresh (indices/handles may have shifted after the
  // text pass's removes/inserts).
  const objCount = m.FPDFPage_CountObjects(page);
  for (let i = 0; i < objCount; i++) {
    const obj = m.FPDFPage_GetObject(page, i);
    const type = m.FPDFPageObj_GetType(obj);
    if (type === FPDF_PAGEOBJ_IMAGE) {
      report.imageOutcomes.push(redactImageObject(m, page, obj, targetRect));
    } else if (type === FPDF_PAGEOBJ_PATH) {
      report.pathOutcomes.push(redactPathObject(m, page, obj, targetRect));
    } else if (type === FPDF_PAGEOBJ_FORM) {
      report.formXObjects.push(inspectFormXObject(m, obj));
    }
  }

  m.FPDFPage_GenerateContent(page);

  const writer = m.PDFiumExt_OpenFileWriter();
  const saved = m.PDFiumExt_SaveAsCopy(doc, writer);
  if (!saved) throw new Error(`PDFiumExt_SaveAsCopy failed for ${entry.file}`);
  const size = m.PDFiumExt_GetFileWriterSize(writer);
  const outPtr = m.pdfium.wasmExports.malloc(size);
  m.PDFiumExt_GetFileWriterData(writer, outPtr, size);
  const out = Buffer.from(m.pdfium.HEAPU8.subarray(outPtr, outPtr + size));
  m.pdfium.wasmExports.free(outPtr);
  m.PDFiumExt_CloseFileWriter(writer);

  m.FPDF_ClosePage(page);
  m.FPDF_CloseDocument(doc);
  m.pdfium.wasmExports.free(ptr);

  return { bytes: out, report };
}

export async function redactFile(srcPath, entry, outPath) {
  const bytes = fs.readFileSync(srcPath);
  const { bytes: outBytes, report } = await redactPdf(bytes, entry);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, outBytes);
  return report;
}

// ---------------------------------------------------------------------------
// CLI: run over the whole corpus.
// ---------------------------------------------------------------------------
async function main() {
  const corpusDir = path.resolve(__dirname, '../corpus');
  const corpusJsonPath = path.join(corpusDir, 'corpus.json');
  const outDir = path.resolve(__dirname, '../out/pdfium');
  const corpus = JSON.parse(fs.readFileSync(corpusJsonPath, 'utf8'));

  const reports = [];
  for (const entry of corpus) {
    const srcPath = path.join(corpusDir, entry.file);
    if (!fs.existsSync(srcPath)) continue;
    const outPath = path.join(outDir, entry.file);
    try {
      const report = await redactFile(srcPath, entry, outPath);
      reports.push(report);
      console.log(
        `${entry.file}: textRemoved=${report.textRemovedFully} textRebuilt=${report.textRebuiltPartial} images=${JSON.stringify(report.imageOutcomes)} paths=${JSON.stringify(report.pathOutcomes)} forms=${JSON.stringify(report.formXObjects)}`,
      );
    } catch (err) {
      console.error(`${entry.file}: FAILED - ${err.message}`);
      reports.push({ file: entry.file, error: err.message });
    }
  }

  fs.writeFileSync(path.join(__dirname, 'reports.json'), JSON.stringify(reports, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
