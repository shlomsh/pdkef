import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageGlyph } from '../../editor/adapters/pdf/pageGlyphs.ts';
import type { DeletablePdfObject } from './DeletableObjectOverlay.tsx';
import useObjectPreviews from './useObjectPreviews.ts';

const readGlyphsMock = vi.fn<(pdfjs: unknown, page: { pageNumber: number }) => Promise<PageGlyph[] | null>>();
vi.mock('../../editor/adapters/pdf/pdfjsLoader.js', () => ({ getPdfjs: async () => ({}) }));
vi.mock('../../editor/adapters/pdf/readGlyphs.js', () => ({ readGlyphs: (pdfjs: unknown, page: { pageNumber: number }) => readGlyphsMock(pdfjs, page) }));

const line = (chars: string): PageGlyph[] =>
  [...chars].map((ch, i) => ({ unicode: ch, isSpace: ch === ' ', matrix: [10, 0, 0, 10, i * 5, 400], width: 0.5 }));

const run = (id: string, pageIndex: number): DeletablePdfObject => ({
  id, pageIndex, kind: 'text', rect: { left: 0, top: 0, width: 1, height: 1 }, start: 0, end: 1,
  bbox: { x: 0, y: 395, width: 60, height: 15 },
} as DeletablePdfObject);

const pdfDocument = {
  getPage: async (pageNumber: number) => ({ pageNumber, view: [0, 0, 600, 800], rotate: 0, userUnit: 1 }),
} as unknown as PDFDocumentProxy;

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('useObjectPreviews', () => {
  let container: HTMLDivElement;
  afterEach(() => { act(() => { render(null, container); }); container.remove(); readGlyphsMock.mockReset(); });

  function mount(doc: PDFDocumentProxy | null, objects: DeletablePdfObject[], enabled = true) {
    container = document.createElement('div');
    const seen: { current: DeletablePdfObject[] } = { current: [] };
    function Harness() {
      seen.current = useObjectPreviews(doc, objects, enabled);
      return null;
    }
    act(() => { render(h(Harness, {}), container); });
    return seen;
  }

  it('gives each text object the words its page shows there', async () => {
    readGlyphsMock.mockResolvedValue(line('Hello world'));
    const objects = [run('a', 0), { ...run('img', 0), kind: 'image' as const }];
    const seen = mount(pdfDocument, objects);
    await settle();
    expect(seen.current.find((o) => o.id === 'a')?.preview).toBe('Hello world');
    expect(seen.current.find((o) => o.id === 'img')?.preview).toBeUndefined();
  });

  it('leaves the objects as they are while nothing is read, without a document, or when switched off', async () => {
    const objects = [run('a', 0)];
    expect(mount(null, objects).current).toBe(objects);
    await settle();
    const off = mount(pdfDocument, objects, false);
    await settle();
    expect(off.current).toBe(objects);
    expect(readGlyphsMock).not.toHaveBeenCalled();
  });

  it('gives no preview on a page whose text cannot be read', async () => {
    readGlyphsMock.mockResolvedValue(null);
    const objects = [run('a', 0)];
    const seen = mount(pdfDocument, objects);
    await settle();
    expect(seen.current[0].preview).toBeUndefined();
  });

  it('stops reading pages past the glyph cap', async () => {
    const big = Array.from({ length: 400_001 }, () => ({ unicode: 'x', isSpace: false, matrix: [10, 0, 0, 10, 900, 100], width: 0.5 }) as PageGlyph);
    readGlyphsMock.mockImplementation(async (_pdfjs, page) => (page.pageNumber === 1 ? big : line('later')));
    const seen = mount(pdfDocument, [run('first', 0), run('second', 1)]);
    await settle();
    expect(readGlyphsMock).toHaveBeenCalledTimes(1);
    expect(seen.current.find((o) => o.id === 'second')?.preview).toBeUndefined();
  });
});
