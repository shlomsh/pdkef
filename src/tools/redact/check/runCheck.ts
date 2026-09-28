/**
 * RED-17: runs the whole check of a saved file. The one module here that
 * loads pdf.js and reads pages; the island reaches it only through a dynamic
 * import after an export, so nobody who never downloads pays for it.
 *
 * The result keeps its `context` so a term the person types later is checked
 * with the pure `checkSavedFile` alone, without reading the file again.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getPdfjs } from '../../../editor/adapters/pdf/pdfjsLoader.js';
import { readGlyphs } from '../../../editor/adapters/pdf/readGlyphs.js';
import { pageGeometryFromPdfJsPage } from '../../../editor/geometry/coords.ts';
import { PDFJS_WASM_URL } from '../../../lib/pdfjsWasm.js';
import { readTextItems } from '../../../lib/pdfTextItems.ts';
import type { SearchablePage } from '../find/findMatches.ts';
import { buildPageText } from '../find/pageText.ts';
import type { TextItemLike } from '../find/types.ts';
import { checkSavedFile } from './checkSavedFile.ts';
import { coveredTerms } from './coveredTerms.ts';
import { readSavedFile } from './readSavedFile.ts';
import { checkBoxesOnPage } from './renderBoxes.ts';
import type { CheckBox, CheckTerm, SavedFile, TermResult } from './types.ts';

export interface CheckContext {
  original: SearchablePage[];
  boxes: CheckBox[];
  saved: SavedFile;
}

export interface CheckOutcome {
  context: CheckContext;
  results: TermResult[];
  /** Pages with a Blackout or Whiteout that didn't come out one flat colour. */
  unsolidPages: number[];
}

const isTextItem = (item: object): item is TextItemLike => typeof (item as TextItemLike).str === 'string';

const createCanvas = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

export async function runSavedFileCheck({
  originalDoc,
  savedBytes,
  boxes,
  extraTerms,
  picturePages,
}: {
  originalDoc: PDFDocumentProxy;
  savedBytes: Uint8Array;
  boxes: CheckBox[];
  /** Find searches used on this document. */
  extraTerms: CheckTerm[];
  /** Pages the export saved as pictures. */
  picturePages: number[];
}): Promise<CheckOutcome> {
  const pdfjs: any = await getPdfjs();

  const original: SearchablePage[] = [];
  const coveredPages = [];
  for (let pageIndex = 0; pageIndex < originalDoc.numPages; pageIndex += 1) {
    const page = await originalDoc.getPage(pageIndex + 1);
    const geometry = pageGeometryFromPdfJsPage(page);
    const items = (await readTextItems(page)).filter(isTextItem);
    original.push({ text: buildPageText(pageIndex, items), geometry });
    const pageBoxes = boxes.filter((box) => box.pageIndex === pageIndex);
    if (pageBoxes.length === 0) continue;
    const glyphs = await readGlyphs(pdfjs, page);
    if (glyphs) coveredPages.push({ glyphs, geometry, boxes: pageBoxes });
  }

  const loadingTask = pdfjs.getDocument({ data: savedBytes.slice(), wasmUrl: PDFJS_WASM_URL });
  try {
    const savedDoc = await loadingTask.promise;
    const saved = await readSavedFile(pdfjs, savedDoc, { picturePages });

    const unsolidPages: number[] = [];
    const solidBoxPages = [...new Set(boxes.filter((box) => box.type !== 'blur').map((box) => box.pageIndex))];
    for (const pageIndex of solidBoxPages) {
      const page = await savedDoc.getPage(pageIndex + 1);
      const solidity = await checkBoxesOnPage(page, boxes.filter((box) => box.pageIndex === pageIndex), createCanvas);
      if (solidity.some((entry) => !entry.solid)) unsolidPages.push(pageIndex);
    }

    const context = { original, boxes, saved };
    const terms = [...coveredTerms(coveredPages), ...extraTerms];
    return { context, results: checkSavedFile({ ...context, terms }), unsolidPages };
  } finally {
    void loadingTask.destroy();
  }
}
