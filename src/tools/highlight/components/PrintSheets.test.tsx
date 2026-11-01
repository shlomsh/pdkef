import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { PageTurns } from '#editor/geometry/pageTurn.ts';
import PrintSheets from './PrintSheets.tsx';

const renderPageToCanvas = vi.hoisted(() => vi.fn());
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
});

async function mount(withNotes: boolean, pageTurns?: PageTurns, doc: PDFDocumentProxy = pdfDocument, els: EditorElement[] = elements) {
  renderPageToCanvas.mockResolvedValue({ toDataURL: () => 'data:image/png;base64,AAAA' });
  const onReady = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { render(<PrintSheets pdfDocument={doc} elements={els} withNotes={withNotes} pageTurns={pageTurns} onReady={onReady} />, container!); });
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
    expect(scales[0]).toBeCloseTo(2 * 0.72 * (96 / 72));
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
