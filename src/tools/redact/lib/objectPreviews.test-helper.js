import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pointAtLegacyWorker } from '../../../test/support/realPdfjs.ts';
import { PDFJS_WASM_URL } from '#lib/pdf/pdfjsWasm.js';
import { pageGeometryFromPdfJsPage } from '#editor/geometry/coords.ts';
import { previewTexts } from './deletePreviews.ts';
import { readGlyphs } from './readGlyphs.js';

pointAtLegacyWorker(pdfjs);

/**
 * RED-16: `objects` (as `extractPageObjects`/`listDeletableObjects` report
 * them) with the `preview` Delete shows, read the way the app reads it: the
 * page's glyphs through pdf.js, then `previewTexts`. The parser reports no
 * text of its own, so a test that finds an object by what it says goes
 * through here.
 */
export async function withPreviews(bytes, objects) {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), wasmUrl: PDFJS_WASM_URL });
  const pdf = await task.promise;
  try {
    const previews = new Map();
    for (const pageIndex of new Set(objects.filter((o) => o.kind === 'text' || o.kind === 'mark').map((o) => o.pageIndex))) {
      const page = await pdf.getPage(pageIndex + 1);
      const glyphs = (await readGlyphs(pdfjs, page)) ?? [];
      const onPage = objects.filter((o) => o.pageIndex === pageIndex);
      for (const [id, text] of previewTexts(onPage, glyphs, pageGeometryFromPdfJsPage(page))) previews.set(id, text);
    }
    return objects.map((o) => (previews.has(o.id) ? { ...o, preview: previews.get(o.id) } : o));
  } finally {
    await task.destroy();
  }
}
