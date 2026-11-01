// The baseline adapter: today's highlight reader (SIGN-46, `src/lib/pageLayout/`), run the way a swipe runs it,
// behind the layout corpus's reader contract (README "The reader contract"). It does not change the
// reader: it hands it a canvas-shaped raster and reads the same windows a swipe reads.
//
// Today's reader has no page layout, only a window: three fallback lines above and below the press, the
// column that holds the press, and the rows in that column. So `layout` asks it once per probe, around
// each truth row the way a swipe would, and the rows it reports are the ones under each press (its other
// window rows are clipped at the window's cut edges and would be counted twice).
import { columnSpanAt, findTextRows } from '#lib/pageLayout/textRows.ts';
import { createSwipeReader } from '#lib/pageLayout/swipeReader.ts';
import { canvasWindowRect } from '#lib/pageLayout/swipe.ts';
import { rowIndexAt } from '#lib/pageLayout/bands.ts';

// The reader's own constants (swipeReader.ts), so its windows are the ones the adapter reads.
const FALLBACK_HEIGHT_PTS = 14;
const MARGIN_LINES = 3;

/** RGBA pixels of a gray raster's rectangle, the shape of a canvas ImageData. */
function imageData(raster, x, y, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const src = (y + row) * raster.width + x;
    for (let col = 0; col < width; col++) {
      const g = raster.data[src + col];
      const i = (row * width + col) * 4;
      data[i] = g;
      data[i + 1] = g;
      data[i + 2] = g;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/** A canvas over a gray raster: all the reader asks of one is its size and getImageData. */
export function canvasOf(raster) {
  const ctx = {
    getImageData(x, y, width, height) {
      return imageData(raster, Math.max(0, x), Math.max(0, y), Math.min(width, raster.width - x), Math.min(height, raster.height - y));
    },
  };
  return { width: raster.width, height: raster.height, getContext: () => ctx };
}

/** The window's pixels from x = left to right, as swipeReader.ts's cropColumns. */
function cropColumns(win, left, right) {
  const width = right - left;
  const data = new Uint8ClampedArray(width * win.height * 4);
  for (let y = 0; y < win.height; y++) data.set(win.data.subarray((y * win.width + left) * 4, (y * win.width + right) * 4), y * width * 4);
  return { data, width, height: win.height };
}

const near = (a, b) => Math.abs(a.x0 - b.x0) <= 1 && Math.abs(a.x1 - b.x1) <= 1 && Math.abs(a.y0 - b.y0) <= 1 && Math.abs(a.y1 - b.y1) <= 1;

/**
 * layout(raster, { probes, pageHeightPts }) -> { rows, atProbe, columnsAt, skewDeg: null, order: null }.
 * probes: [{ x, y, columnXs }] raster px; columnXs are the x's at which to ask for a column.
 * Everything returned is raster px: rows { x0, x1, y0, y1, gaps }, columnsAt[i] the distinct spans.
 */
export function windowedLayout(raster, { probes, pageHeightPts }) {
  const lineHeight = (FALLBACK_HEIGHT_PTS * raster.height) / pageHeightPts;
  const size = { width: raster.width, height: raster.height };
  const rows = [];
  const atProbe = [];
  const columnsAt = [];
  for (const probe of probes) {
    const rect = canvasWindowRect(size, probe.y, probe.y, MARGIN_LINES * lineHeight);
    const win = imageData(raster, rect.x, rect.y, rect.width, rect.height);
    const column = columnSpanAt(win, probe.x - rect.x);
    const whole = column.left === 0 && column.right === win.width;
    const found = findTextRows(whole ? win : cropColumns(win, column.left, column.right));
    const mapped = found.map((r) => ({
      x0: r.left + column.left,
      x1: r.right + column.left,
      y0: r.top + rect.y,
      y1: r.bottom + rect.y,
      gaps: r.gaps.map(([s, e]) => [s + column.left, e + column.left]),
    }));
    const at = rowIndexAt(found, probe.y - rect.y);
    atProbe.push(at >= 0 ? mapped[at] : null);
    const hit = at >= 0 ? mapped[at] : null;
    if (hit && !rows.some((kept) => near(kept, hit))) rows.push(hit);
    const spans = [];
    for (const x of probe.columnXs ?? []) {
      const span = columnSpanAt(win, x - rect.x);
      if (!spans.some((s) => s.x0 === span.left && s.x1 === span.right)) spans.push({ x0: span.left, x1: span.right });
    }
    columnsAt.push(spans.sort((p, q) => p.x0 - q.x0));
  }
  return { rows, atProbe, columnsAt, skewDeg: null, order: null };
}

/** The reader under test, as the corpus calls it. */
export const todaysReader = {
  name: 'windowed (SIGN-46 textRows + swipeReader)',
  layout: windowedLayout,
  swipe: (raster, { pageHeightPts, direction }) => createSwipeReader(canvasOf(raster), pageHeightPts, direction),
};
