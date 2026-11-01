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
let latest: ReturnType<typeof useWorkspaceZoom> | null = null;
const workspace = document.createElement('div');
const column = document.createElement('div');
workspace.appendChild(column);
const workspaceRef = { current: workspace };
const columnRef = { current: column };
function Probe({ pageTurns, fullscreen = false, noted = false }: { pageTurns: PageTurns; fullscreen?: boolean; noted?: boolean }) {
  latest = useWorkspaceZoom({ pdfDocument: doc, workspaceRef, columnRef, fullscreen, pageTurns, noted });
  pages = latest.pages;
  return null;
}

const container = document.createElement('div');
afterEach(() => { act(() => render(null, container)); });

async function mount(pageTurns: PageTurns, fullscreen = false, noted = false) {
  readInkBounds.mockResolvedValue(null);
  await act(async () => { render(<Probe pageTurns={pageTurns} fullscreen={fullscreen} noted={noted} />, container); });
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

describe('useWorkspaceZoom in the normal view', () => {
  it('leaves a ctrl+wheel pinch to the browser: not prevented, no lamp, zoom unchanged', async () => {
    await mount({});
    const before = latest!.zoom;
    const e = new WheelEvent('wheel', { ctrlKey: true, deltaY: -50, cancelable: true, bubbles: true });
    await act(async () => { workspace.dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(false);
    expect(latest!.zoom).toBe(before);
  });

  it('leaves mod+= to the browser: not prevented, no lamp, zoom unchanged', async () => {
    await mount({});
    const before = latest!.zoom;
    const e = new KeyboardEvent('keydown', { key: '=', ctrlKey: true, metaKey: true, cancelable: true, bubbles: true });
    await act(async () => { document.dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(false);
    expect(latest!.zoom).toBe(before);
  });
});

describe('useWorkspaceZoom chrome and entering the lamp', () => {
  afterEach(() => { localStorage.clear(); Object.defineProperty(workspace, 'clientWidth', { value: 0, configurable: true }); });
  it('chrome is 1 in the normal view and, at the lamp Fit width, still 1 with a 240px notes column', async () => {
    Object.defineProperty(workspace, 'clientWidth', { value: 1000, configurable: true });
    await mount({}, false, true);
    expect(latest!.chrome).toBe(1);
    await mount({}, true, true);
    expect(latest!.chrome).toBeCloseTo(1);
    expect(latest!.notesPx).toBeCloseTo(240);
    expect(latest!.zoom).toBeCloseTo((1000 - 32 - 240) / 600);
  });
  it('enters the lamp at Fit width and remembers nothing when it is zoomed there', async () => {
    Object.defineProperty(workspace, 'clientWidth', { value: 1000, configurable: true });
    await mount({}, true);
    expect(latest!.setting).toBe('width');
    expect(latest!.zoom).toBeCloseTo((1000 - 32) / 600);
    await act(async () => { latest!.step(1); });
    expect(latest!.setting).not.toBe('width');
    expect(localStorage.length).toBe(0);
    expect('touched' in latest! || 'details' in latest!).toBe(false);
  });
});
