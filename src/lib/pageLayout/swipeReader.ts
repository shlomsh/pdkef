// Reads the painted page around a swipe and returns page-percent bands. DOM-free apart from the
// canvas it is handed; all geometry is in swipe.ts, all row logic in textRows.ts / bands.ts.
import { bandsForSwipe, rowIndexAt, type Band, type ReadingDirection } from './bands.ts';
import { columnSpanAt, findTextRows, type RasterWindow, type TextRow } from './textRows.ts';
import { bandsToPagePercent, canvasWindowRect } from './swipe.ts';

interface PagePoint { x: number; y: number }
interface SwipeReader { bandsBetween(a: PagePoint, b: PagePoint): Band[]; onText(a: PagePoint): boolean }

const FALLBACK_HEIGHT_PTS = 14;
const MARGIN_LINES = 3;
const pct = (v: number, size: number) => (Math.min(100, Math.max(0, v)) / 100) * size;

/** The window's pixels from x = left to right, copied row by row. */
function cropColumns(win: RasterWindow, left: number, right: number): RasterWindow {
  const width = right - left;
  const data = new Uint8ClampedArray(width * win.height * 4);
  for (let y = 0; y < win.height; y += 1) {
    data.set(win.data.subarray((y * win.width + left) * 4, (y * win.width + right) * 4), y * width * 4);
  }
  return { data, width, height: win.height };
}

/** Text rows of one column of the window, with x offset back to window px. */
function rowsInColumn(win: RasterWindow, column: { left: number; right: number }): TextRow[] {
  const whole = column.left === 0 && column.right === win.width;
  const rows = findTextRows(whole ? win : cropColumns(win, column.left, column.right));
  if (whole) return rows;
  return rows.map((r) => ({
    ...r,
    left: r.left + column.left,
    right: r.right + column.left,
    gaps: r.gaps.map(([s, e]) => [s + column.left, e + column.left] as [number, number]),
  }));
}

/** Null when the canvas has no pixels or no 2d context. */
export function createSwipeReader(canvas: HTMLCanvasElement | null, pageHeightPts: number, direction: ReadingDirection = 'ltr'): SwipeReader | null {
  if (!canvas || !canvas.width || !canvas.height) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const size = { width: canvas.width, height: canvas.height };
  const lineHeight = (FALLBACK_HEIGHT_PTS * size.height) / pageHeightPts;
  const margin = MARGIN_LINES * lineHeight;
  // Fixed by the first read: the column the swipe was pressed in, for the whole swipe.
  let column: { left: number; right: number } | null = null;
  let cache: { top: number; bottom: number; rows: TextRow[] } | null = null;

  const rowsFor = (yMin: number, yMax: number, pressX: number): { top: number; rows: TextRow[] } | null => {
    // Reuse while the swipe stays a line away from the window's cut edges.
    if (cache
      && (cache.top === 0 || yMin - lineHeight >= cache.top)
      && (cache.bottom === size.height || yMax + lineHeight <= cache.bottom)) {
      return { top: cache.top, rows: cache.rows };
    }
    const rect = canvasWindowRect(size, yMin, yMax, margin);
    if (rect.height <= 0) return null;
    let image: ImageData;
    try {
      image = ctx.getImageData(rect.x, rect.y, rect.width, rect.height);
    } catch {
      // expected: an unreadable canvas means the swipe finds no rows and is cancelled
      return null;
    }
    const win = { data: image.data, width: image.width, height: image.height };
    column ??= columnSpanAt(win, pressX - rect.x);
    const rows = rowsInColumn(win, column);
    cache = { top: rect.y, bottom: rect.y + rect.height, rows };
    return { top: rect.y, rows };
  };

  return {
    onText(a) {
      const y = pct(a.y, size.height);
      const hit = rowsFor(y, y, pct(a.x, size.width));
      return !!hit && rowIndexAt(hit.rows, y - hit.top) >= 0;
    },
    bandsBetween(a, b) {
      const ay = pct(a.y, size.height);
      const by = pct(b.y, size.height);
      const hit = rowsFor(Math.min(ay, by), Math.max(ay, by), pct(a.x, size.width));
      if (!hit) return [];
      const bands = bandsForSwipe(
        hit.rows,
        { x: pct(a.x, size.width), y: ay - hit.top },
        { x: pct(b.x, size.width), y: by - hit.top },
        lineHeight,
        direction,
      );
      return bandsToPagePercent(bands, hit.top, size).filter((band) => band.width > 0 && band.height > 0);
    },
  };
}

/** Paints bands (percent of the element box) into the node's draft layer; none clears it. */
export function paintHighlightDraft(elementNode: HTMLElement, bands: Band[], color: string): void {
  const draft = elementNode.querySelector<HTMLElement>('[data-highlight-draft]');
  if (!draft) return;
  draft.replaceChildren(...bands.map((band) => {
    const div = elementNode.ownerDocument.createElement('div');
    div.style.cssText = `position:absolute;left:${band.left}%;top:${band.top}%;width:${band.width}%;height:${band.height}%;background:${color}`;
    return div;
  }));
}
