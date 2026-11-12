import { describe, expect, it } from 'vitest';
import { NEW_BOOK, readPhoto } from './photoPage.ts';
import type { GrayImage, Quad } from './quad.ts';
import { PAGE, onTable, textPage } from './textPage.test-helper.ts';

const { BAR, FIRST_Y, GROWTH, H, LEFT0, PITCH, RIGHT0, ROWS, W } = PAGE;

const px = (c: Quad[number]) => ({ x: c.x * W, y: c.y * H });
const TEXT_WIDTH = RIGHT0 - LEFT0;
/** The test page's text width in line pitches, measured halfway down the trapezoid. */
const BOOK_WIDTH = (TEXT_WIDTH + GROWTH / 2) / PITCH;
const PHOTOS = { photos: 3, scans: 0, widths: [BOOK_WIDTH, BOOK_WIDTH] };
const cornersOf = (gray: GrayImage, book = NEW_BOOK) => readPhoto(gray, book).corners!.map(px);

/** A drawing beside the text: thin upright strokes, which are print but no line of text. */
function withFigure(page: GrayImage, x0: number, x1: number, y0: number, y1: number): GrayImage {
  const data = new Uint8ClampedArray(page.data);
  for (let x = x0; x < x1; x += 8) for (let y = y0; y < y1; y += 1) data.fill(20, y * W + x, y * W + x + 2);
  return { ...page, data };
}

// A phone photo of a book page (SCAN-69): the sheet's edge is the table, so the page stops at margins of its own.
describe('readPhoto', () => {
  it('on a photo, stops at book margins around the text instead of the table at the sheet\'s edge', () => {
    const [tl, tr, br, bl] = cornersOf(onTable(textPage()));
    for (const c of [tl, bl]) {
      expect(c.x).toBeGreaterThan(LEFT0 - GROWTH - 0.15 * TEXT_WIDTH);
      expect(c.x).toBeLessThan(LEFT0 - GROWTH / 2);
    }
    for (const c of [tr, br]) {
      expect(c.x).toBeLessThan(RIGHT0 + GROWTH + 0.15 * TEXT_WIDTH);
      expect(c.x).toBeGreaterThan(RIGHT0 + GROWTH / 2);
    }
    // Top and bottom leave room for a running head and a page number, not the photo's full height.
    expect(tl.y).toBeGreaterThan(FIRST_Y - 0.2 * TEXT_WIDTH);
    expect(bl.y).toBeLessThan(FIRST_Y + (ROWS - 1) * PITCH + BAR + 0.2 * TEXT_WIDTH);
    expect(bl.y).toBeLessThan(H - 0.02 * H);
  });

  it('leaves a clean scan with paper to its edges to the scan\'s own read', () => {
    expect(readPhoto(textPage())).toMatchObject({ photo: false, corners: null });
  });

  it('reads a sheet with paper to its edges as a photo in a book of photos: a book is shot one way', () => {
    const read = readPhoto(textPage(), PHOTOS);
    expect(read.photo).toBe(true);
    const [tl, tr] = read.corners!.map(px);
    expect(tl.x).toBeGreaterThan(LEFT0 - GROWTH - 0.15 * TEXT_WIDTH);
    expect(tr.x).toBeLessThan(RIGHT0 + GROWTH + 0.15 * TEXT_WIDTH);
  });

  it('keeps a scanned book scanned', () => {
    expect(readPhoto(textPage(), { photos: 1, scans: 3, widths: [] }).photo).toBe(false);
  });

  it('counts each sheet\'s own border into the book', () => {
    expect(readPhoto(onTable(textPage()), PHOTOS).book).toMatchObject({ photos: 4, scans: 0 });
    expect(readPhoto(textPage(), PHOTOS).book).toMatchObject({ photos: 3, scans: 1 });
  });

  it('tells the book a sure page\'s text width in line pitches', () => {
    const { book } = readPhoto(onTable(textPage()));
    expect(book.widths).toHaveLength(1);
    expect(book.widths[0]).toBeGreaterThan(0.9 * BOOK_WIDTH);
    expect(book.widths[0]).toBeLessThan(1.1 * BOOK_WIDTH);
  });

  // Lines wrapping round a figure end on a slant, and more of them sit on it than on the text's own right side.
  it('fits a side that leans away from the other again, parallel to it', () => {
    const page = onTable(textPage({ rightCut: (r) => (r >= 12 ? 4 * (r - 11) : 0) }));
    const [, tr, br] = cornersOf(page);
    for (const c of [tr, br]) expect(c.x).toBeGreaterThan(RIGHT0);
    expect(Math.abs(br.x - tr.x)).toBeLessThan(0.05 * TEXT_WIDTH);
  });

  it('widens a column beside a figure to the book\'s text width, toward the figure', () => {
    const column = textPage({ column: [LEFT0 + 50, LEFT0 + 330] });
    const page = onTable(withFigure(column, LEFT0 + 345, RIGHT0, 150, 500));
    const [tl, tr, br, bl] = cornersOf(page, PHOTOS);
    for (const c of [tr, br]) expect(c.x).toBeGreaterThan(RIGHT0);
    for (const c of [tl, bl]) expect(c.x).toBeGreaterThan(LEFT0);
  });

  it('keeps a scanned book scanned after one dark cover', () => {
    expect(readPhoto(textPage(), { photos: 1, scans: 0, widths: [] }).photo).toBe(false);
  });

  it('leaves a column where it is when both sides have room and neither holds print', () => {
    const page = onTable(textPage({ column: [LEFT0 + 80, LEFT0 + 380] }));
    const [tl, tr] = cornersOf(page, PHOTOS);
    expect(tl.x).toBeGreaterThan(LEFT0 + 80 - 0.15 * TEXT_WIDTH);
    expect(tr.x).toBeLessThan(LEFT0 + 380 + 0.15 * TEXT_WIDTH);
  });

  it('learns the book\'s width from the pages it reads, then widens a column by it', () => {
    let { book } = readPhoto(onTable(textPage()));
    ({ book } = readPhoto(onTable(textPage()), book));
    const column = onTable(withFigure(textPage({ column: [LEFT0 + 50, LEFT0 + 330] }), LEFT0 + 345, RIGHT0, 150, 500));
    const [, tr, br] = cornersOf(column, book);
    for (const c of [tr, br]) expect(c.x).toBeGreaterThan(RIGHT0);
  });
});
