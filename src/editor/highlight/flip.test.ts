// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { HighlightElement } from '../model/editorModel.ts';
import { createSwipeReader } from '#lib/pageLayout/swipeReader.ts';
import { flipChanges } from './flip.ts';

// A 300 x 400 px page with two text lines (words at x 20-60 and 66-130), at y 100-114 and 140-154.
const W = 300;
const H = 400;
function pageCanvas(inked = true) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000000';
  if (inked) for (const y of [100, 140]) for (const [x, w] of [[20, 40], [66, 64]]) ctx.fillRect(x, y, w, 14);
  return canvas;
}
// The reader the tool builds for the new direction, over the page's own pixels.
const readerFor = (direction: 'ltr' | 'rtl', canvas = pageCanvas()) => {
  const reader = createSwipeReader(canvas, H, direction)!;
  return (a: { x: number; y: number }, b: { x: number; y: number }) => reader.bandsBetween(a, b);
};
// A reader that finds nothing: the page's pixels cannot be read.
const unreadableReader = (direction: 'ltr' | 'rtl') => {
  const canvas = pageCanvas();
  // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom canvases are never tainted, so no real read throws; the only real way a reader answers with no bands.
  vi.spyOn(canvas.getContext('2d')!, 'getImageData').mockImplementation(() => { throw new Error('tainted'); });
  return readerFor(direction, canvas);
};

// A highlight over rows given as [x, y, width, height] in page px: box and bands in percent.
const highlightOver = (rows: number[][], direction?: 'ltr' | 'rtl'): HighlightElement => {
  const left = Math.min(...rows.map((r) => r[0]));
  const right = Math.max(...rows.map((r) => r[0] + r[2]));
  const top = Math.min(...rows.map((r) => r[1]));
  const bottom = Math.max(...rows.map((r) => r[1] + r[3]));
  return {
    id: 'h', type: 'highlight', pageIndex: 0, color: '#ff0',
    left: (left / W) * 100, top: (top / H) * 100, width: ((right - left) / W) * 100, height: ((bottom - top) / H) * 100,
    bands: rows.map(([x, y, w, h]) => ({
      left: ((x - left) / (right - left)) * 100, top: ((y - top) / (bottom - top)) * 100,
      width: (w / (right - left)) * 100, height: (h / (bottom - top)) * 100,
    })),
    ...(direction ? { direction } : {}),
  };
};
// The flipped highlight's bands back in page px as [x, width], rounded.
const bandsInPx = (el: ReturnType<typeof flipChanges>) => {
  const g = el as { left: number; width: number; bands: Array<{ left: number; width: number }> };
  return g.bands.map((b) => [Math.round(((g.left + (b.left / 100) * g.width) / 100) * W), Math.round(((b.width / 100) * g.width / 100) * W)]);
};

describe('flipChanges recovers the swipe from the bands', () => {
  it('RTL: from the first row right edge to the last row left edge', () => {
    // The swipe starts at x 100 on the first row and ends at x 50 on the last; the reader reads it as LTR.
    const out = flipChanges(highlightOver([[20, 100, 80, 14], [50, 140, 80, 14]], 'rtl'), readerFor('ltr'));
    expect(bandsInPx(out)).toEqual([[100, 30], [20, 40]]);
  });
  it('LTR: from the first row left edge to the last row right edge', () => {
    // The swipe starts at x 40 on the first row and ends at x 110 on the last; the reader reads it as RTL.
    const out = flipChanges(highlightOver([[40, 100, 90, 14], [20, 140, 90, 14]]), readerFor('rtl'));
    expect(bandsInPx(out)).toEqual([[20, 40], [110, 20]]);
  });
  it('reads each end at the middle of its row, so a band taller than its line still finds it', () => {
    // Bands 34 px tall reach into the gap below each line: their middles sit on the lines, their bottom edges do not.
    const out = flipChanges(highlightOver([[20, 100, 80, 34], [50, 140, 80, 34]], 'rtl'), readerFor('ltr'));
    expect(bandsInPx(out)).toEqual([[100, 30], [20, 40]]);
  });
});

describe('flipChanges probe', () => {
  it('probe', () => {
    const tall = flipChanges(highlightOver([[20, 100, 80, 34], [50, 140, 80, 34]], 'rtl'), readerFor('ltr'));
    console.log('TALL', JSON.stringify(bandsInPx(tall)), JSON.stringify(tall));
    const out = flipChanges(highlightOver([[40, 100, 90, 14], [20, 140, 90, 14]]), readerFor('rtl'));
    console.log('BOX', JSON.stringify(out), (100 / H) * 100, (54 / H) * 100);
  });
});

describe('flipChanges', () => {
  it('re-reads the bands in the other direction and returns the new geometry', () => {
    const out = flipChanges(highlightOver([[40, 100, 90, 14], [20, 140, 90, 14]]), readerFor('rtl'));
    expect(out).toMatchObject({ direction: 'rtl' });
    const box = out as { left: number; width: number };
    expect(box.left).toBeCloseTo((20 / W) * 100, 6);
    expect(box.width).toBeCloseTo((110 / W) * 100, 6);
    // The rows the reader found, from the first line's top to the last line's bottom, in page percent.
    expect(out).toMatchObject({ top: expect.closeTo(24.475, 6), height: expect.closeTo(14.55, 6) });
    expect('bands' in out && out.bands).toHaveLength(2);
  });
  it('flips ltr to rtl', () => {
    expect(flipChanges(highlightOver([[40, 100, 90, 14], [20, 140, 90, 14]]), unreadableReader('rtl'))).toEqual({ direction: 'rtl' });
  });
  it('changes only the direction for a single band', () => {
    // A reader over real text would return a band, so a bare direction proves it was never asked.
    const el = highlightOver([[20, 100, 110, 14]], 'rtl');
    expect(flipChanges(el, readerFor('ltr'))).toEqual({ direction: 'ltr' });
  });
  it('changes only the direction when no reader is available or it returns nothing', () => {
    const el = highlightOver([[40, 100, 90, 14], [20, 140, 90, 14]], 'rtl');
    expect(flipChanges(el)).toEqual({ direction: 'ltr' });
    expect(flipChanges(el, unreadableReader('ltr'))).toEqual({ direction: 'ltr' });
  });
});
