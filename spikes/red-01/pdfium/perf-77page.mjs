// Times redacting one box on each of a 77-page x 20-lines-per-page doc using
// the PDFium engine, one full page-object pass per page (mirrors what a
// real "redact these boxes" batch would do).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadPdfium } from './engine-pdfium.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FPDF_PAGEOBJ_TEXT = 1;

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

async function main() {
  const m = await loadPdfium();
  const bytes = fs.readFileSync(path.join(__dirname, 'perf-77page.pdf'));
  const entries = JSON.parse(fs.readFileSync(path.join(__dirname, 'perf-77page-entries.json'), 'utf8'));

  const t0 = performance.now();

  const ptr = m.pdfium.wasmExports.malloc(bytes.length);
  m.pdfium.HEAPU8.set(bytes, ptr);
  const doc = m.FPDF_LoadMemDocument64(ptr, bytes.length, '');
  const pageCount = m.FPDF_GetPageCount(doc);

  for (let i = 0; i < pageCount; i++) {
    const page = m.FPDF_LoadPage(doc, i);
    const entry = entries[i];
    // Target rect: the known secret line's PDF-space bbox, generously
    // padded, computed directly (this fixture is unrotated, so no
    // device<->page conversion is needed - see engine-pdfium.mjs for that).
    const { x, y, w } = entry.secretRect;
    const targetRect = { left: x - 2, right: x + w + 2, bottom: y - 3, top: y + 12 };

    const textPage = m.FPDFText_LoadPage(page);
    const count = m.FPDFText_CountChars(textPage);
    const toRemove = new Set();
    withScratch(m, [8, 8, 8, 8], (lPtr, rPtr, bPtr, tPtr) => {
      for (let c = 0; c < count; c++) {
        const objPtr = m.FPDFText_GetTextObject(textPage, c);
        if (!objPtr) continue;
        const ok = m.FPDFText_GetCharBox(textPage, c, lPtr, rPtr, bPtr, tPtr);
        if (!ok) continue;
        const box = { left: readDouble(m, lPtr), right: readDouble(m, rPtr), bottom: readDouble(m, bPtr), top: readDouble(m, tPtr) };
        const inside = box.left >= targetRect.left && box.right <= targetRect.right && box.bottom >= targetRect.bottom && box.top <= targetRect.top;
        if (inside) toRemove.add(objPtr);
      }
    });
    for (const obj of toRemove) m.FPDFPage_RemoveObject(page, obj);
    m.FPDFText_ClosePage(textPage);
    m.FPDFPage_GenerateContent(page);
    m.FPDF_ClosePage(page);
  }

  const writer = m.PDFiumExt_OpenFileWriter();
  m.PDFiumExt_SaveAsCopy(doc, writer);
  const size = m.PDFiumExt_GetFileWriterSize(writer);
  const outPtr = m.pdfium.wasmExports.malloc(size);
  m.PDFiumExt_GetFileWriterData(writer, outPtr, size);
  const out = Buffer.from(m.pdfium.HEAPU8.subarray(outPtr, outPtr + size));
  m.pdfium.wasmExports.free(outPtr);
  m.PDFiumExt_CloseFileWriter(writer);
  m.FPDF_CloseDocument(doc);

  const t1 = performance.now();
  fs.writeFileSync(path.join(__dirname, 'perf-77page-out.pdf'), out);
  console.log(`77 pages x 20 lines, 1 box/page: ${(t1 - t0).toFixed(1)}ms total, ${((t1 - t0) / pageCount).toFixed(2)}ms/page, output ${out.length} bytes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
