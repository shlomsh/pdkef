// A scanned PDF as Scan's input (PE-08): each sheet drawn as an upright picture, with one quad per book page
// found by planPage. One sheet at a time, so a phone holds one picture. The reader is the only door to pdf.js.
import { assess, planPage } from '#lib/pageEnhance/plan.ts';
import type { GrayImage, Quad } from '#lib/pageEnhance/quad.ts';
import { spineInBorder, type Spine } from '#lib/pageEnhance/spine.ts';
import { throwIfAborted } from '#lib/output/abort.js';
import { FULL_QUAD } from './quad.ts';
import { SOURCE_LONG_EDGE } from './pageWork/steps.ts';
import { shortLineCounts } from './lineEnds.ts';
import { openPdfSheetReader } from './pdfSheetReader.ts';
import type { SplitQuestion } from '../state/scanWork.ts';

/** What assess is tuned for: a sheet shrunk to about this many pixels on its long edge. */
const READ_LONG_EDGE = 1000;

/** How far past a crooked sheet a bent page's flattening reaches, as a share of the sheet: 3% on the worst Adobe Scan pages. */
const BEND_ROOM = 0.05;

/** Paper tone added around a sheet, each side a share of the sheet's own width or height. */
export interface SheetBorder { left: number; top: number; right: number; bottom: number }

/** One sheet of the PDF as a picture, and its book pages' corners (0 to 1 of the picture) in reading order. */
export interface PdfSheet {
  file: File;
  quads: Quad[];
  /** Set when the sheet may be two pages but is not sure: it stays one page and asks. */
  question: SplitQuestion | null;
}

/** The one seam: what the PDF gives, so the loop runs without pdf.js. `extraTurns` is clockwise quarter turns on top of the page's own /Rotate. */
export interface SheetReader {
  pageCount: number;
  /** Whether the page's text is Hebrew or Arabic; null when the page has no text to read. */
  rightToLeft(pageNumber: number): Promise<boolean | null>;
  grayOf(pageNumber: number, longEdge: number, extraTurns: number): Promise<GrayImage>;
  jpegOf(pageNumber: number, longEdge: number, extraTurns: number, border: SheetBorder): Promise<{ blob: Blob; width: number; height: number }>;
  close(): void;
}

const RIGHT_TO_LEFT_LETTER = /[֐-׿؀-ۿݐ-ݿ]/;

/** True when the text has any Hebrew or Arabic letter: its book turns right to left. */
export const readsRightToLeft = (text: string): boolean => RIGHT_TO_LEFT_LETTER.test(text);

interface SheetRead {
  quads: Quad[];
  turns: number;
  possibleSpine: Spine | null;
  /** Short lines by the side they sit against, on a sheet of two pages: what says which page comes first when the PDF has no text. */
  lines: { left: number; right: number };
}

const NO_LINES = { left: 0, right: 0 };

/** The corners of page `pageNumber`: read from a small copy, redrawn turned when the text runs down it.
 * `possibleSpine` is a line worth asking about, in the turned sheet; null when the sheet is sure either way. */
async function quadsOf(reader: SheetReader, pageNumber: number): Promise<SheetRead> {
  let turns = 0;
  let gray = await reader.grayOf(pageNumber, READ_LONG_EDGE, turns);
  let a = assess(gray);
  // A second turn is for a sheet that only reads as upside down once it is turned the first time.
  for (let reads = 0; reads < 2 && a.turn !== 0; reads += 1) {
    turns = (turns + a.turn) % 4;
    gray = await reader.grayOf(pageNumber, READ_LONG_EDGE, turns);
    a = assess(gray);
  }
  // Still asking for a turn after that: the read is not to be trusted, so the sheet is one page.
  if (a.turn !== 0) return { quads: [FULL_QUAD], turns, possibleSpine: null, lines: NO_LINES };
  const line = a.spine ?? a.possibleSpine;
  const lines = line ? shortLineCounts(gray, (line.top + line.bottom) / 2) : NO_LINES;
  // Only the quads are kept, and they are in 0 to 1 of the picture, so the small copy stands for the full one.
  return { quads: planPage(gray, a, gray).pieces.map((p) => p.quad), turns, possibleSpine: a.possibleSpine, lines };
}

/** The border that puts every corner on the picture: a levelled page's corners can fall just off a tilted sheet, where the corner editor cannot reach them. */
function borderFor(quads: Quad[], force: boolean): SheetBorder {
  // A sheet that asks gets the room too: a person's split levels its corners past the sheet's edge.
  if (!force && quads.length === 1 && quads[0].every((p, i) => p.x === FULL_QUAD[i].x && p.y === FULL_QUAD[i].y)) return { left: 0, top: 0, right: 0, bottom: 0 };
  const points = quads.flat();
  return {
    left: BEND_ROOM + Math.max(0, ...points.map((p) => -p.x)),
    top: BEND_ROOM + Math.max(0, ...points.map((p) => -p.y)),
    right: BEND_ROOM + Math.max(0, ...points.map((p) => p.x - 1)),
    bottom: BEND_ROOM + Math.max(0, ...points.map((p) => p.y - 1)),
  };
}

/** The same corners, 0 to 1 of the sheet with its border. */
const inBorder = (quad: Quad, { left, top, right, bottom }: SheetBorder) => quad.map(({ x, y }) => ({
  x: (x + left) / (1 + left + right),
  y: (y + top) / (1 + top + bottom),
})) as Quad;

const baseName = (file: File) => file.name.replace(/\.pdf$/i, '');

/** The sheets of `pdf`, one at a time. `reader` is for tests; otherwise pdf.js reads the file. */
export async function* pdfSheets(
  pdf: File,
  signal?: AbortSignal,
  reader?: SheetReader,
): AsyncGenerator<PdfSheet> {
  const sheets = reader ?? await openPdfSheetReader(pdf, signal);
  // Over the whole file so far, as one sheet says too little, and a book's list of English sources says the wrong thing.
  const seen = { ...NO_LINES };
  try {
    for (let n = 1; n <= sheets.pageCount; n += 1) {
      throwIfAborted(signal);
      const { quads, turns, possibleSpine, lines } = await quadsOf(sheets, n);
      seen.left += lines.left;
      seen.right += lines.right;
      const rtl = (quads.length > 1 || !!possibleSpine) && (await sheets.rightToLeft(n) ?? seen.right > seen.left);
      const border = borderFor(quads, !!possibleSpine);
      const { blob } = await sheets.jpegOf(n, SOURCE_LONG_EDGE, turns, border);
      throwIfAborted(signal);
      const file = new File([blob], `${baseName(pdf)}-${n}.jpg`, { type: 'image/jpeg' });
      const placed = quads.map((quad) => inBorder(quad, border));
      const question = possibleSpine ? { spine: spineInBorder(possibleSpine, border), rightToLeft: rtl } : null;
      yield { file, quads: quads.length > 1 && rtl ? placed.reverse() : placed, question };
    }
  } finally {
    sheets.close();
  }
}
