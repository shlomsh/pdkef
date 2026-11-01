import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { PageTurns } from '#editor/geometry/pageTurn.ts';
import PrintSheets from './PrintSheets.tsx';

const renderPageToCanvas = vi.hoisted(() => vi.fn());
const readPageInk = vi.hoisted(() => vi.fn(async (_doc?: unknown, _index?: number): Promise<{ left: number; right: number } | null> => null));
vi.mock('../hooks/readInkBounds.ts', () => ({ readPageInk }));
vi.mock('#lib/pdf/renderPage.js', () => ({ renderPageToCanvas }));

const band = { left: 0, top: 0, width: 100, height: 100 };
const elements: EditorElement[] = [
  { id: 'h1', type: 'highlight', pageIndex: 0, color: '#fde047', left: 10, top: 20, width: 50, height: 5, bands: [band, band] },
  { id: 'h2', type: 'highlight', pageIndex: 1, color: '#fde047', left: 10, top: 20, width: 50, height: 5, bands: [band], style: 'underline' },
  { id: 'c1', type: 'comment', pageIndex: 0, left: 0, top: 0, width: 0, height: 0, comment: 'first', anchor: { kind: 'element', elementId: 'h1' } },
  { id: 'c2', type: 'comment', pageIndex: 1, left: 0, top: 0, width: 0, height: 0, comment: 'שלום', anchor: { kind: 'element', elementId: 'h2' } },
  { id: 'c3', type: 'comment', pageIndex: 1, left: 0, top: 0, width: 0, height: 0, comment: 'on a passage', anchor: { kind: 'passage', bands: [band] } },
] as EditorElement[];

const pdfDocument = {
  numPages: 2,
  getPage: async () => ({ getViewport: () => ({ width: 600, height: 800 }) }),
} as unknown as PDFDocumentProxy;

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  renderPageToCanvas.mockReset();
  readPageInk.mockReset();
  readPageInk.mockResolvedValue(null);
});

async function mount(notes: boolean | 'end', pageTurns?: PageTurns, doc: PDFDocumentProxy = pdfDocument, els: EditorElement[] = elements) {
  renderPageToCanvas.mockResolvedValue({ toDataURL: () => 'data:image/png;base64,AAAA' });
  const onReady = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { render(<PrintSheets pdfDocument={doc} elements={els} notes={notes === 'end' ? 'end' : notes ? 'beside' : 'none'} pageTurns={pageTurns} onReady={onReady} />, container!); });
  await vi.waitFor(() => expect(renderPageToCanvas).toHaveBeenCalledTimes(2));
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return { onReady };
}
const root = () => document.body.querySelector('[data-print-root]') as HTMLElement;
const sheets = () => [...root().querySelectorAll('[data-print-sheet]')] as HTMLElement[];
const loadAll = () => act(() => { root().querySelectorAll('img').forEach((img) => img.dispatchEvent(new Event('load'))); });

describe('PrintSheets', () => {
  it('mounts a print root on the body with one sized sheet per page', async () => {
    await mount(false);
    expect(root().parentElement).toBe(document.body);
    expect(sheets()).toHaveLength(2);
    expect(sheets()[0].style.width).toBe('600pt');
    expect(sheets()[0].style.height).toBe('800pt');
    expect(root().querySelectorAll('img')).toHaveLength(2);
    expect(root().querySelectorAll('[data-print-card]')).toHaveLength(0);
  });

  it('renders each page at twice its printed size', async () => {
    await mount(true);
    const scales = renderPageToCanvas.mock.calls.map((c) => c[1].scale);
    expect(scales[0]).toBeCloseTo(2 * ((600 - 48 - 12 - 132) / 600) * (96 / 72));
  });

  it('with notes, slides the page so its ink starts at the margin and puts the column 12 pt past the ink', async () => {
    readPageInk.mockResolvedValue({ left: 0.1, right: 0.9 });
    await mount(true);
    const s = (600 - 48 - 12 - 132) / 480;
    const box = sheets()[0].querySelector('img')!.parentElement as HTMLElement;
    expect(parseFloat(box.style.left)).toBeCloseTo(24 - 60 * s);
    const notes = sheets()[0].querySelector('[data-print-card]')!.parentElement as HTMLElement;
    expect(parseFloat(notes.style.left)).toBeCloseTo(24 + 480 * s + 12);
  });

  it('reads each page\'s own ink, so two sheets with different ink put their notes at different x', async () => {
    readPageInk.mockImplementation(async (_doc, index) => (index === 0 ? { left: 0.1, right: 0.9 } : { left: 0.1, right: 0.6 }));
    await mount(true);
    const left = (i: number) => parseFloat((sheets()[i].querySelector('[data-print-card]')!.parentElement as HTMLElement).style.left);
    expect(left(0)).not.toBeCloseTo(left(1));
  });

  it('gives a card the color of its highlight as --mark', async () => {
    await mount(true);
    const card = sheets()[0].querySelector('[data-print-card]') as HTMLElement;
    expect(card.style.getPropertyValue('--mark')).toBe('#fde047');
  });

  it('draws highlight bands as plain divs, an underline too', async () => {
    await mount(false);
    expect(sheets()[0].querySelectorAll('[data-print-band]')).toHaveLength(2);
    expect(sheets()[1].querySelectorAll('[data-print-band]')).toHaveLength(1);
  });

  it('prints an underline as wide as its strokeWidth, 3 when it has none, lifted 1pt, in page-scaled CSS px', async () => {
    const under = (id: string, extra: object) => ({ id, type: 'highlight', pageIndex: 0, color: '#fde047', left: 10, top: 20, width: 50, height: 5, bands: [band], style: 'underline', ...extra }) as EditorElement;
    await mount(false, undefined, pdfDocument, [under('w', { strokeWidth: 2 }), under('d', {})]);
    const bands = [...sheets()[0].querySelectorAll('[data-print-band]')] as HTMLElement[];
    expect(bands.map((b) => b.style.getPropertyValue('--line'))).toEqual(['2px', '3px']);
    expect(bands.map((b) => b.style.getPropertyValue('--lift'))).toEqual(['1px', '1px']);
  });

  it('with notes, puts one card per highlight comment on its sheet, text read as typed', async () => {
    await mount(true);
    const cards = [...root().querySelectorAll('[data-print-sheet] [data-print-card]')] as HTMLElement[];
    expect(cards.map((c) => c.textContent)).toEqual(['first', 'שלום']);
    expect(cards[1].getAttribute('dir')).toBe('auto');
    expect(sheets()[0].querySelectorAll('[data-print-card]')).toHaveLength(1);
    expect(sheets()[1].querySelectorAll('[data-print-card]')).toHaveLength(1);
    expect(root().querySelector('[data-print-measure]')).toBeNull();
  });

  it('calls onReady once, after every image has loaded', async () => {
    const { onReady } = await mount(true);
    expect(onReady).not.toHaveBeenCalled();
    act(() => { root().querySelectorAll('img')[0].dispatchEvent(new Event('load')); });
    expect(onReady).not.toHaveBeenCalled();
    loadAll();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('renders a turned page landscape, asking pdf.js for the page rotation plus the turn', async () => {
    const rotations: number[] = [];
    const doc = {
      numPages: 2,
      getPage: async () => ({
        rotate: 90,
        getViewport: ({ rotation }: { rotation: number }) => {
          rotations.push(rotation);
          return rotation % 180 === 0 ? { width: 600, height: 800 } : { width: 800, height: 600 };
        },
      }),
    } as unknown as PDFDocumentProxy;
    await mount(false, { 0: 1 }, doc);
    expect(sheets()[0].style.width).toBe('600pt');
    expect(sheets()[1].style.width).toBe('800pt');
    expect(rotations).toContain(180);
    expect(rotations).toContain(90);
  });

  it('removes its root when it unmounts', async () => {
    await mount(false);
    act(() => render(null, container!));
    expect(document.body.querySelector('[data-print-root]')).toBeNull();
  });
});

describe('PrintSheets notes at the end', () => {
  const pageLabels = (sheet: HTMLElement) => [...sheet.querySelectorAll('[data-print-end-entry]')].map((n) => n.textContent);

  it('prints the pages as plain print does, with no notes column, then one notes sheet', async () => {
    await mount('end');
    expect(sheets()).toHaveLength(3);
    expect(root().querySelectorAll('[data-print-card]')).toHaveLength(0);
    expect(root().querySelectorAll('img')).toHaveLength(2);
    expect(sheets()[0].querySelectorAll('[data-print-band]')).toHaveLength(2);
    expect(sheets()[0].style.width).toBe('600pt');
    expect(sheets()[2].style.width).toBe('600pt');
    expect(sheets()[2].style.height).toBe('800pt');
    expect(root().querySelector('[data-print-measure]')).toBeNull();
  });

  it('lists each comment under its page label, in reading order, with no quoted passage and nothing for a bare highlight', async () => {
    const els = [
      ...elements,
      { id: 'h3', type: 'highlight', pageIndex: 0, color: '#86efac', left: 10, top: 5, width: 50, height: 5, bands: [band] },
      { id: 'c4', type: 'comment', pageIndex: 0, left: 0, top: 0, width: 0, height: 0, comment: 'earlier on page one', anchor: { kind: 'element', elementId: 'h3' } },
      { id: 'h4', type: 'highlight', pageIndex: 1, color: '#86efac', left: 10, top: 60, width: 50, height: 5, bands: [band] },
    ] as EditorElement[];
    await mount('end', undefined, pdfDocument, els);
    const entries = [...sheets()[2].querySelectorAll('[data-print-end-entry]')] as HTMLElement[];
    expect(entries.map((n) => n.textContent)).toEqual(['Page 1earlier on page one', 'Page 1first', 'Page 2שלום']);
    expect(entries[2].querySelector('[dir="auto"]')?.textContent).toBe('שלום');
    expect(entries[0].style.getPropertyValue('--mark')).toBe('#86efac');
    expect(entries[1].style.getPropertyValue('--mark')).toBe('#fde047');
    expect(pageLabels(sheets()[2])).toHaveLength(3);
  });

  it('adds no notes sheet when the document has no comment', async () => {
    await mount('end', undefined, pdfDocument, elements.filter((el) => el.type === 'highlight'));
    expect(sheets()).toHaveLength(2);
  });

  it('draws the notes sheet upright when the last page was turned sideways', async () => {
    await mount('end', { 1: 1 }, {
      numPages: 2,
      getPage: async () => ({ getViewport: ({ rotation }: { rotation: number }) => (rotation % 180 === 0 ? { width: 600, height: 800 } : { width: 800, height: 600 }) }),
    } as unknown as PDFDocumentProxy);
    expect(sheets()[1].style.width).toBe('800pt');
    expect(sheets()[2].style.width).toBe('600pt');
    expect(sheets()[2].style.height).toBe('800pt');
  });
});
