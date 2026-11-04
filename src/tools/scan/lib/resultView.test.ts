import { describe, expect, it } from 'vitest';
import { exactResultDetail, paperFit, resultViewFor, tilePaper } from './resultView.ts';
import { newPage } from './scanPages.ts';

const page = newPage(new File(['x'], 'a.jpg', { type: 'image/jpeg' }), 'document');
const place = { pageWidth: 10, pageHeight: 20, x: 0, y: 0, width: 10, height: 20 };
const result = { key: 'k', url: 'blob:r', thumbUrl: 'blob:t', page: { blob: new Blob(), thumb: new Blob(), width: 200, height: 400, bentPx: 0 } };

describe('resultViewFor', () => {
  it('shows the built PDF page when it matches what is on screen', () => {
    expect(resultViewFor(page, 0, { shown: { pages: [{ url: 'blob:b', place }] }, ready: true, results: {}, pageSize: 'fit' }))
      .toEqual({ src: 'blob:b', place, exact: true });
  });
  it('falls back to the newest result on its paper, not exact', () => {
    const view = resultViewFor(page, 0, { shown: undefined, ready: false, results: { [page.id]: result }, pageSize: 'a4' });
    expect(view).toMatchObject({ src: 'blob:r', exact: false });
    expect(view.place).toMatchObject({ pageWidth: expect.any(Number) });
  });
  it('shows nothing before the first result', () => {
    expect(resultViewFor(page, 0, { shown: undefined, ready: false, results: {}, pageSize: 'fit' })).toEqual({ src: null, place: null, exact: false });
  });
});

describe('exactResultDetail', () => {
  it('names the size and the page count', () => {
    expect(exactResultDetail(2048, 2)).toMatch(/2 pages/);
  });
});

describe('tilePaper', () => {
  it('is null before the page has a result', () => {
    expect(tilePaper(page, {}, 'fit')).toBeNull();
  });
  it('fills the paper on Fit and shows margins on A4', () => {
    const fit = tilePaper(page, { [page.id]: result }, 'fit')!;
    expect(fit.src).toBe('blob:t');
    expect(fit.place).toMatchObject({ x: 0, y: 0, width: fit.place.pageWidth, height: fit.place.pageHeight });
    const a4 = tilePaper(page, { [page.id]: { ...result, page: { ...result.page, width: 400, height: 200 } } }, 'a4')!;
    expect(a4.place.y).toBeGreaterThan(0);
    const narrow = tilePaper(page, { [page.id]: { ...result, page: { ...result.page, width: 200, height: 800 } } }, 'a4')!;
    expect(narrow.place.x).toBeGreaterThan(0);
  });
});

describe('paperFit', () => {
  it('fits a tall paper by height and a wide one by width inside a 3:4 tile', () => {
    const tall = paperFit({ pageWidth: 300, pageHeight: 600 });
    expect(tall.heightPct).toBeCloseTo(tall.widthPct * 0.75 * 2, 5);
    const wide = paperFit({ pageWidth: 600, pageHeight: 300 });
    expect(wide.widthPct).toBeGreaterThan(wide.heightPct);
    expect(Math.max(tall.heightPct, wide.widthPct)).toBeLessThan(100);
  });
});
