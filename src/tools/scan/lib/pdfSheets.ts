// A scanned PDF as Scan's input (PE-08): each sheet drawn as an upright picture, with one quad per book page
// found by planPage. One sheet at a time, so a phone holds one picture. The reader is the only door to pdf.js.
import { assess, planPage } from '#lib/pageEnhance/plan.ts';
import type { GrayImage, Quad } from '#lib/pageEnhance/quad.ts';
import { throwIfAborted } from '#lib/output/abort.js';
import { FULL_QUAD } from './quad.ts';
import { SOURCE_LONG_EDGE } from './pageWork/steps.ts';
import { openPdfSheetReader } from './pdfSheetReader.ts';

/** What assess is tuned for: a sheet shrunk to about this many pixels on its long edge. */
const READ_LONG_EDGE = 1000;

/** One sheet of the PDF as a picture, and its book pages' corners (0 to 1 of the picture) in reading order. */
export interface PdfSheet { file: File; quads: Quad[] }

/** The one seam: what the PDF gives, so the loop runs without pdf.js. `extraTurns` is clockwise quarter turns on top of the page's own /Rotate. */
export interface SheetReader {
  pageCount: number;
  /** Whether the page's text is Hebrew or Arabic. */
  rightToLeft(pageNumber: number): Promise<boolean>;
  grayOf(pageNumber: number, longEdge: number, extraTurns: number): Promise<GrayImage>;
  jpegOf(pageNumber: number, longEdge: number, extraTurns: number): Promise<{ blob: Blob; width: number; height: number }>;
  close(): void;
}

const RIGHT_TO_LEFT_LETTER = /[֐-׿؀-ۿݐ-ݿ]/;

/** True when the text has any Hebrew or Arabic letter: its book turns right to left. */
export const readsRightToLeft = (text: string): boolean => RIGHT_TO_LEFT_LETTER.test(text);

/** The corners of page `pageNumber`: read from a small copy, redrawn turned when the text runs down it. */
async function quadsOf(reader: SheetReader, pageNumber: number): Promise<{ quads: Quad[]; turns: number }> {
  let turns = 0;
  let gray = await reader.grayOf(pageNumber, READ_LONG_EDGE, turns);
  let a = assess(gray);
  if (a.turn !== 0) {
    turns = 1;
    gray = await reader.grayOf(pageNumber, READ_LONG_EDGE, turns);
    a = assess(gray);
    // Still asking for a turn after one: the read is not to be trusted, so the sheet is one page.
    if (a.turn !== 0) return { quads: [FULL_QUAD], turns };
  }
  // Only the quads are kept, and they are in 0 to 1 of the picture, so the small copy stands for the full one.
  return { quads: planPage(gray, a, gray).pieces.map((p) => p.quad), turns };
}

const baseName = (file: File) => file.name.replace(/\.pdf$/i, '');

/** The sheets of `pdf`, one at a time. `reader` is for tests; otherwise pdf.js reads the file. */
export async function* pdfSheets(
  pdf: File,
  signal?: AbortSignal,
  reader?: SheetReader,
): AsyncGenerator<PdfSheet> {
  const sheets = reader ?? await openPdfSheetReader(pdf, signal);
  try {
    for (let n = 1; n <= sheets.pageCount; n += 1) {
      throwIfAborted(signal);
      const { quads, turns } = await quadsOf(sheets, n);
      const rtl = quads.length > 1 && await sheets.rightToLeft(n);
      const { blob } = await sheets.jpegOf(n, SOURCE_LONG_EDGE, turns);
      throwIfAborted(signal);
      const file = new File([blob], `${baseName(pdf)}-${n}.jpg`, { type: 'image/jpeg' });
      yield { file, quads: rtl ? [...quads].reverse() : quads };
    }
  } finally {
    sheets.close();
  }
}
