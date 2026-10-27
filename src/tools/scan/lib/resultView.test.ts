import { describe, expect, it } from 'vitest';
import { exactResultDetail, resultViewFor } from './resultView.ts';
import { newPage } from './scanPages.ts';

const page = newPage(new File(['x'], 'a.jpg', { type: 'image/jpeg' }), 'document');
const place = { pageWidth: 10, pageHeight: 20, x: 0, y: 0, width: 10, height: 20 };
const result = { key: 'k', url: 'blob:r', thumbUrl: 'blob:t', page: { blob: new Blob(), thumb: new Blob(), width: 200, height: 400 } };

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
