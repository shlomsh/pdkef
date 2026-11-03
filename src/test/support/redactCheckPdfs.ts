/**
 * Real files for the Redact check's `runCheck.test.ts`: small PDFs built with pdf-lib and opened in the legacy pdf.js build,
 * so the whole check runs on real bytes. The only fakes are the edges node lacks: pdf.js's worker URL and
 * the page's canvas (`installCanvas`).
 */
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFJS_WASM_URL } from '#lib/pdf/pdfjsWasm.js';
import type { PercentBox } from '../../tools/redact/lib/find/types.ts';

export const PAGE_WIDTH = 400;
export const PAGE_HEIGHT = 200;

/** A page of text lines, with black rectangles drawn over `blackouts` (page-percent boxes, as the check takes them). */
export interface PageSpec {
  /** Drawn at 20pt from the left, one line per entry from y=150 downwards in 40pt steps. */
  lines?: string[];
  /** One text run of this many glyphs, drawn off the page: a page that is over the glyph budget on its own. */
  glyphRun?: number;
  blackouts?: PercentBox[];
}

/** Where a text line sits, as a page-percent box that covers it (line `row` of a PageSpec). */
export function boxAroundLine(row: number, width = 50): PercentBox {
  const baseline = 150 - row * 40;
  return { left: 3, top: ((PAGE_HEIGHT - baseline - 22) / PAGE_HEIGHT) * 100, width, height: (32 / PAGE_HEIGHT) * 100 };
}

export async function buildPdf(pages: PageSpec[], options: { title?: string } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  if (options.title) doc.setTitle(options.title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const spec of pages) {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    (spec.lines ?? []).forEach((line, row) => page.drawText(line, { x: 20, y: 150 - row * 40, size: 20, font }));
    if (spec.glyphRun) page.drawText('A'.repeat(spec.glyphRun), { x: 0, y: -50, size: 1, font });
    for (const box of spec.blackouts ?? []) {
      const height = (box.height / 100) * PAGE_HEIGHT;
      page.drawRectangle({
        x: (box.left / 100) * PAGE_WIDTH,
        y: PAGE_HEIGHT - (box.top / 100) * PAGE_HEIGHT - height,
        width: (box.width / 100) * PAGE_WIDTH,
        height,
        color: rgb(0, 0, 0),
      });
    }
  }
  return new Uint8Array(await doc.save());
}

// Node has no bundled worker URL; point pdf.js at the legacy build's own.
const workerUrl = new URL('../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href;
Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', { get: () => workerUrl, set() {}, configurable: true });

/** Every loading task the check opened through `legacyPdfjs`, so a test can see it was destroyed. */
export const openedTasks: ReturnType<typeof pdfjs.getDocument>[] = [];

/** The legacy pdf.js build, as `getPdfjs()` hands it out, remembering the tasks the check opens. */
export function legacyPdfjs(): typeof pdfjs {
  return { ...pdfjs, getDocument: ((...args: Parameters<typeof pdfjs.getDocument>) => {
    const task = pdfjs.getDocument(...args);
    openedTasks.push(task);
    return task;
  }) as typeof pdfjs.getDocument };
}

/** The original file as the island holds it: an open pdf.js document. Call `close` when done. */
export async function openOriginal(bytes: Uint8Array): Promise<{ doc: PDFDocumentProxy; close: () => Promise<void> }> {
  const task = pdfjs.getDocument({ data: bytes.slice(), wasmUrl: PDFJS_WASM_URL });
  return { doc: await task.promise, close: () => task.destroy() };
}

/** `document.createElement('canvas')` for the check's page render, on @napi-rs/canvas (what pdf.js itself paints with in node). */
export function installCanvas(): () => void {
  const had = 'document' in globalThis;
  const before = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = { createElement: () => createCanvas(1, 1) };
  return () => {
    if (had) (globalThis as { document?: unknown }).document = before;
    else delete (globalThis as { document?: unknown }).document;
  };
}
