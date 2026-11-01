import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageTurns } from '#editor/geometry/pageTurn.ts';

const readInkBounds = vi.fn();
vi.mock('./readInkBounds.ts', () => ({ readInkBounds: (...a: unknown[]) => readInkBounds(...a) }));

const { useWorkspaceZoom } = await import('./useWorkspaceZoom.ts');

const doc = { numPages: 1, getPage: async () => ({ getViewport: () => ({ width: 600, height: 800 }) }) } as unknown as PDFDocumentProxy;

let pages: ReturnType<typeof useWorkspaceZoom>['pages'] = [];
function Probe({ pageTurns }: { pageTurns: PageTurns }) {
  pages = useWorkspaceZoom({ pdfDocument: doc, workspaceRef: { current: null }, columnRef: { current: null }, fullscreen: false, onEnterLamp: () => {}, pageTurns }).pages;
  return null;
}

const container = document.createElement('div');
afterEach(() => { act(() => render(null, container)); });

async function mount(pageTurns: PageTurns) {
  readInkBounds.mockResolvedValue(null);
  await act(async () => { render(<Probe pageTurns={pageTurns} />, container); });
  await act(async () => { await Promise.resolve(); });
}

describe('useWorkspaceZoom with page turns', () => {
  it('sizes an unturned page as the file has it', async () => {
    await mount({});
    expect(pages[0]).toMatchObject({ width: 600, height: 800 });
  });

  it('lays a page turned once out landscape: width and height swap', async () => {
    await mount({ 0: 1 });
    expect(pages[0]).toMatchObject({ width: 800, height: 600, textLeft: 0, textRight: 800 });
  });

  it('keeps the page upright for a half turn', async () => {
    await mount({ 0: 2 });
    expect(pages[0]).toMatchObject({ width: 600, height: 800 });
  });

  it('reads the ink with the turns', async () => {
    await mount({ 0: 1 });
    expect(readInkBounds).toHaveBeenCalledWith(doc, expect.any(Function), { 0: 1 });
  });
});
