import { render } from 'preact';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { act } from 'preact/test-utils';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { PageTurns } from '#editor/geometry/pageTurn.ts';
import PrintSheets from './PrintSheets.tsx';

// Spy-through: the real ink reader, row finder and sketch code run. The one forced line (in `renderedPages`) stands in
// for pdf.js painting a page, which jsdom cannot do; it hands back page pixels the real ink reader then reads.
vi.mock('../hooks/readInkBounds.ts', { spy: true });
vi.mock('#editor/geometry/sketchStroke.ts', { spy: true });
vi.mock('#lib/pdf/renderPage.js', { spy: true });
import { readPageInk } from '../hooks/readInkBounds.ts';
import { sketchBands, strokeSeed } from '#editor/geometry/sketchStroke.ts';
import { renderPageToCanvas } from '#lib/pdf/renderPage.js';

const band = { left: 0, top: 0, width: 100, height: 100 };
const elements: EditorElement[] = [
  { id: 'h1', type: 'highlight', pageIndex: 0, color: '#fde047', left: 10, top: 20, width: 50, height: 5, bands: [band, band] },
  { id: 'h2', type: 'highlight', pageIndex: 1, color: '#fde047', left: 10, top: 20, width: 50, height: 5, bands: [band], style: 'underline' },
  { id: 'c1', type: 'comment', pageIndex: 0, left: 0, top: 0, width: 0, height: 0, comment: 'first', anchor: { kind: 'element', elementId: 'h1' } },
  { id: 'c2', type: 'comment', pageIndex: 1, left: 0, top: 0, width: 0, height: 0, comment: 'שלום', anchor: { kind: 'element', elementId: 'h2' } },
  { id: 'c3', type: 'comment', pageIndex: 1, left: 0, top: 0, width: 0, height: 0, comment: 'on a passage', anchor: { kind: 'passage', bands: [band] } },
] as EditorElement[];

// Each page knows its number, so the painted pixels can differ per page.
const pageOf = (n: number, extra: object = {}) => ({ n, rotate: 0, getViewport: () => ({ width: 600, height: 800 }), ...extra });
const pdfDocument = { numPages: 2, getPage: async (n: number) => pageOf(n) } as unknown as PDFDocumentProxy;

// The ink the next painted page carries, as fractions of its width; a page with no entry is blank paper.
let inkOf: (pageNumber: number) => { left: number; right: number } | null = () => null;
const WIDTH = 800;
const HEIGHT = 1000;
/** White 800 x 1000 pixels with five solid 20px-tall rows spanning the ink, the way a canvas gives them. */
function paintedPage(ink: { left: number; right: number } | null) {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4).fill(255);
  if (ink) {
    for (let row = 0; row < 5; row += 1) {
      for (let y = 100 + row * 100; y < 120 + row * 100; y += 1) {
        for (let x = Math.round(ink.left * WIDTH); x < Math.round(ink.right * WIDTH); x += 1) data.fill(0, (y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 3);
      }
    }
  }
  return { width: WIDTH, height: HEIGHT, getContext: () => ({ getImageData: () => ({ data, width: WIDTH, height: HEIGHT }) }), toDataURL: () => 'data:image/png;base64,AAAA' };
}

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  vi.mocked(renderPageToCanvas).mockReset();
  vi.mocked(readPageInk).mockClear();
  inkOf = () => null;
});

// Resolves once `count` page pictures have been taken from the painted pages (the ink reads paint too, but take no picture).
function renderedPages(count: number) {
  const done = Promise.withResolvers<void>();
  let pictures = 0;
  vi.mocked(renderPageToCanvas).mockImplementation(async (page) => {
    const canvas = paintedPage(inkOf((page as unknown as { n: number }).n));
    const toDataURL = canvas.toDataURL;
    canvas.toDataURL = () => { pictures += 1; if (pictures >= count) done.resolve(); return toDataURL(); };
    return canvas as never;
  });
  return done.promise;
}

async function mount(notes: boolean | 'end', pageTurns?: PageTurns, doc: PDFDocumentProxy = pdfDocument, els: EditorElement[] = elements) {
  const rendered = renderedPages(2);
  const onReady = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { render(<PrintSheets pdfDocument={doc} elements={els} notes={notes === 'end' ? 'end' : notes ? 'beside' : 'none'} pageTurns={pageTurns} onReady={onReady} />, container!); });
  await rendered;
  await act(async () => { await drainPromises(); });
  return { onReady };
}
const root = () => document.body.querySelector('[data-print-root]') as HTMLElement;
const sheets = () => [...root().querySelectorAll('[data-print-sheet]')] as HTMLElement[];
const loadAll = () => act(() => { root().querySelectorAll('img').forEach((img) => img.dispatchEvent(new Event('load'))); });

describe('PrintSheets', () => {
  it('READ-11: a sketched mark prints as one svg path in page points, inside the opacity layer', async () => {
    vi.mocked(sketchBands).mockClear();
    const sketched = { ...elements[0], stroke: 'sketch', opacity: 0.6 } as EditorElement;
    await mount(false, undefined, pdfDocument, [sketched]);
    const svg = sheets()[0].querySelector('svg[data-highlight-sketch]')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 600 800');
    expect(svg.querySelector('path')!.getAttribute('fill')).toBe('#fde047');
    expect((svg.parentElement as HTMLElement).style.opacity).toBe('0.6');
    expect(sheets()[0].querySelectorAll('[data-print-band]')).toHaveLength(0);
    // h1 is 50% x 5% of the 600 x 800 page at (10%, 20%); both bands fill it.
    expect(sketchBands).toHaveBeenCalledWith(Array(2).fill({ x: 60, y: 160, w: 300, h: 40 }), strokeSeed('h1'), 0);
  });

  it('READ-14: a pencil mark prints as hatch strokes in page points, inside the opacity layer', async () => {
    const { loadHatch } = await import('../lib/outline/hatchLoader.ts');
    await loadHatch();
    const pencil = { ...elements[0], style: 'pencil', opacity: 0.6 } as EditorElement;
    await mount(false, undefined, pdfDocument, [pencil]);
    const svg = sheets()[0].querySelector('svg[data-highlight-hatch]')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 600 800');
    const path = svg.querySelector('path')!;
    expect(path.getAttribute('stroke')).toBe('#fde047');
    expect(path.getAttribute('stroke-width')).toBe('1.6');
    expect((svg.parentElement as HTMLElement).style.opacity).toBe('0.6');
    expect(sheets()[0].querySelectorAll('[data-print-band]')).toHaveLength(0);
  });

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
    // the ink reads of the noted pages come first, then one picture per page
    const scales = vi.mocked(renderPageToCanvas).mock.calls.slice(-2).map((c) => c[1].scale);
    expect(scales[0]).toBeCloseTo(2 * ((600 - 48 - 12 - 132) / 600) * (96 / 72));
  });

  it('with notes, slides the page so its ink starts at the margin and puts the column 12 pt past the ink', async () => {
    inkOf = () => ({ left: 0.1, right: 0.9 });
    await mount(true);
    const s = (600 - 48 - 12 - 132) / 480;
    const box = sheets()[0].querySelector('img')!.parentElement as HTMLElement;
    expect(parseFloat(box.style.left)).toBeCloseTo(24 - 60 * s);
    const notes = sheets()[0].querySelector('[data-print-card]')!.parentElement as HTMLElement;
    expect(parseFloat(notes.style.left)).toBeCloseTo(24 + 480 * s + 12);
  });

  it('reads the ink of the pages that carry a note only', async () => {
    const doc = { numPages: 3, getPage: async (n: number) => pageOf(n) } as unknown as PDFDocumentProxy;
    const els = [
      { id: 'h', type: 'highlight', pageIndex: 1, color: '#fde047', left: 10, top: 20, width: 50, height: 5, bands: [band] },
      { id: 'c', type: 'comment', pageIndex: 1, left: 0, top: 0, width: 0, height: 0, comment: 'only', anchor: { kind: 'element', elementId: 'h' } },
    ] as EditorElement[];
    const rendered = renderedPages(3);
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => { render(<PrintSheets pdfDocument={doc} elements={els} notes="beside" onReady={vi.fn()} />, container!); });
    await rendered;
    expect(vi.mocked(readPageInk)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(readPageInk).mock.calls[0][1]).toBe(1);
  });

  it('reads each page\'s own ink, so two sheets with different ink put their notes at different x', async () => {
    inkOf = (n) => (n === 1 ? { left: 0.1, right: 0.9 } : { left: 0.1, right: 0.6 });
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
      getPage: async (n: number) => ({
        n,
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

  it('marks a turned sheet with its quarter turns so the underline can follow the text edge', async () => {
    await mount(false, { 0: 1 });
    expect(sheets()[0].getAttribute('data-page-turns')).toBe('1');
    expect(sheets()[1].hasAttribute('data-page-turns')).toBe(false);
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
      getPage: async (n: number) => ({ n, rotate: 0, getViewport: ({ rotation }: { rotation: number }) => (rotation % 180 === 0 ? { width: 600, height: 800 } : { width: 800, height: 600 }) }),
    } as unknown as PDFDocumentProxy);
    expect(sheets()[1].style.width).toBe('800pt');
    expect(sheets()[2].style.width).toBe('600pt');
    expect(sheets()[2].style.height).toBe('800pt');
  });
});
