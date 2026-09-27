// RED-12 spike: extract text and per-character glyph boxes from a PDF using
// PDFium (Chrome's PDF engine, compiled to WebAssembly via @embedpdf/pdfium),
// to compare against pdf.js's own text-layer output for the same file. Reuses
// the init/scratch-buffer/UTF16 patterns from ./engine-pdfium.mjs (the RED-01
// spike this folder already holds).
//
// Usage:
//   node extract-pdfium.mjs <file.pdf>
//   node extract-pdfium.mjs <file.pdf> --find <string>
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { init } from '@embedpdf/pdfium';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pdfiumModulePromise = null;
async function loadPdfium() {
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

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Decode a UTF-16LE buffer of `byteLen` bytes (including trailing NUL) from wasm heap into a JS string. */
function decodeUtf16FromHeap(m, ptr, byteLen) {
  // byteLen includes the trailing NUL (2 bytes); drop it.
  const codeUnitCount = Math.max(0, Math.floor(byteLen / 2) - 1);
  const buf = m.pdfium.HEAPU8.subarray(ptr, ptr + codeUnitCount * 2);
  const codeUnits = new Uint16Array(codeUnitCount);
  for (let i = 0; i < codeUnitCount; i++) {
    codeUnits[i] = buf[i * 2] | (buf[i * 2 + 1] << 8);
  }
  // Decode UTF-16 code units (including surrogate pairs) properly.
  let out = '';
  for (let i = 0; i < codeUnits.length; i++) {
    const unit = codeUnits[i];
    if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < codeUnits.length) {
      const next = codeUnits[i + 1];
      if (next >= 0xdc00 && next <= 0xdfff) {
        const codePoint = (unit - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
        out += String.fromCodePoint(codePoint);
        i++;
        continue;
      }
    }
    out += String.fromCharCode(unit);
  }
  return out;
}

/** FPDFText_GetText: buffer sized in UTF16 code units (including trailing NUL). */
function getPageText(m, textPage) {
  const count = m.FPDFText_CountChars(textPage);
  const codeUnitCount = count + 1; // + trailing NUL
  const byteLen = codeUnitCount * 2;
  const ptr = m.pdfium.wasmExports.malloc(byteLen);
  try {
    m.FPDFText_GetText(textPage, 0, count, ptr);
    return decodeUtf16FromHeap(m, ptr, byteLen);
  } finally {
    m.pdfium.wasmExports.free(ptr);
  }
}

function getCharBox(m, textPage, index) {
  return withScratch(m, [8, 8, 8, 8], (lPtr, rPtr, bPtr, tPtr) => {
    const ok = m.FPDFText_GetCharBox(textPage, index, lPtr, rPtr, bPtr, tPtr);
    if (!ok) return null;
    return {
      left: readDouble(m, lPtr),
      right: readDouble(m, rPtr),
      bottom: readDouble(m, bPtr),
      top: readDouble(m, tPtr),
    };
  });
}

function isZeroSizeBox(box) {
  if (!box) return true;
  return box.right - box.left === 0 || box.top - box.bottom === 0;
}

function extractPage(m, textPage) {
  const text = getPageText(m, textPage);
  const count = m.FPDFText_CountChars(textPage);
  const chars = [];
  for (let i = 0; i < count; i++) {
    const box = getCharBox(m, textPage, i);
    if (isZeroSizeBox(box)) continue;
    const unicode = m.FPDFText_GetUnicode(textPage, i);
    chars.push({
      c: String.fromCodePoint(unicode),
      box: [round2(box.left), round2(box.bottom), round2(box.right), round2(box.top)],
    });
  }
  return { text, chars };
}

function findInPage(m, textPage, query) {
  const queryPtr = (() => {
    const byteLen = (query.length + 1) * 2;
    const ptr = m.pdfium.wasmExports.malloc(byteLen);
    m.pdfium.stringToUTF16(query, ptr, byteLen);
    return ptr;
  })();
  const results = [];
  try {
    // flags = 0: case-insensitive, not whole-word.
    const search = m.FPDFText_FindStart(textPage, queryPtr, 0, 0);
    if (!search) return results;
    try {
      while (m.FPDFText_FindNext(search)) {
        const idx = m.FPDFText_GetSchResultIndex(search);
        const count = m.FPDFText_GetSchCount(search);
        const byteLen = (count + 1) * 2;
        const ptr = m.pdfium.wasmExports.malloc(byteLen);
        try {
          m.FPDFText_GetText(textPage, idx, count, ptr);
          const matched = decodeUtf16FromHeap(m, ptr, byteLen);
          results.push(matched);
        } finally {
          m.pdfium.wasmExports.free(ptr);
        }
      }
    } finally {
      m.FPDFText_FindClose(search);
    }
  } finally {
    m.pdfium.wasmExports.free(queryPtr);
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args[0];
  if (!filePath) {
    console.error('usage: node extract-pdfium.mjs <file.pdf> [--find <string>]');
    process.exit(1);
  }
  const findIdx = args.indexOf('--find');
  const findQuery = findIdx !== -1 ? args[findIdx + 1] : null;

  const m = await loadPdfium();
  const bytes = fs.readFileSync(path.resolve(filePath));
  const ptr = m.pdfium.wasmExports.malloc(bytes.length);
  m.pdfium.HEAPU8.set(bytes, ptr);
  const doc = m.FPDF_LoadMemDocument64(ptr, bytes.length, '');
  if (!doc) throw new Error(`FPDF_LoadMemDocument64 failed for ${filePath}: err=${m.FPDF_GetLastError()}`);

  const pageCount = m.FPDF_GetPageCount(doc);

  if (findQuery) {
    const hits = [];
    for (let i = 0; i < pageCount; i++) {
      const page = m.FPDF_LoadPage(doc, i);
      if (!page) continue;
      const textPage = m.FPDFText_LoadPage(page);
      if (textPage) {
        const matches = findInPage(m, textPage, findQuery);
        for (const text of matches) hits.push({ page: i, text });
        m.FPDFText_ClosePage(textPage);
      }
      m.FPDF_ClosePage(page);
    }
    m.FPDF_CloseDocument(doc);
    m.pdfium.wasmExports.free(ptr);
    process.stdout.write(JSON.stringify({ engine: 'pdfium', find: findQuery, hits }));
    return;
  }

  const pages = [];
  for (let i = 0; i < pageCount; i++) {
    const page = m.FPDF_LoadPage(doc, i);
    if (!page) {
      pages.push({ text: '', chars: [] });
      continue;
    }
    const textPage = m.FPDFText_LoadPage(page);
    if (textPage) {
      pages.push(extractPage(m, textPage));
      m.FPDFText_ClosePage(textPage);
    } else {
      pages.push({ text: '', chars: [] });
    }
    m.FPDF_ClosePage(page);
  }

  m.FPDF_CloseDocument(doc);
  m.pdfium.wasmExports.free(ptr);

  process.stdout.write(JSON.stringify({ engine: 'pdfium', pages }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
