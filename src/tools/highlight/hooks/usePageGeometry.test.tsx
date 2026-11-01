import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { usePageGeometry } from './usePageGeometry.ts';

let container: HTMLElement | null = null;
let api: ReturnType<typeof usePageGeometry>;

function Probe(props: { doc: PDFDocumentProxy; turns: number }) {
  api = usePageGeometry(props.doc, 0, props.turns);
  return null;
}

function stubDocument() {
  const page = {
    view: [0, 0, 600, 800],
    rotate: 0,
    getTextContent: async () => ({ items: [] }),
    streamTextContent: () => ({ getReader: () => ({ read: async () => ({ done: true }) }) }),
  };
  const getPage = vi.fn(async () => page);
  return { doc: { getPage } as unknown as PDFDocumentProxy, getPage };
}

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('usePageGeometry', () => {
  it('turns the geometry it already holds at once, without reading the page again', async () => {
    const { doc, getPage } = stubDocument();
    container = document.createElement('div');
    act(() => render(<Probe doc={doc} turns={0} />, container!));
    await vi.waitFor(() => expect(api.geometry).toBeDefined());
    expect(api.geometry?.width).toBe(600);
    expect(api.geometry?.height).toBe(800);

    act(() => render(<Probe doc={doc} turns={1} />, container!));
    expect(api.geometry?.width).toBe(800);
    expect(api.geometry?.height).toBe(600);
    expect(getPage).toHaveBeenCalledTimes(1);
  });
});
