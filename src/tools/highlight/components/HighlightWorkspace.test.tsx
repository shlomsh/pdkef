import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workspaceStyles from '#editor-ui/Workspace.module.css';
import toolbarStyles from '#editor-ui/SignToolbar.module.css';
import HighlightWorkspace from './HighlightWorkspace.tsx';
import { useHighlightComments } from '../hooks/useHighlightComments.ts';
import type { CommentElement, EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { DEFAULT_MARKER } from '../lib/marker/markerState.ts';
import { NOTES_W } from '../lib/zoom/fit.ts';

vi.mock('#editor-ui/PdfPageCanvas.tsx', () => ({ default: () => <canvas data-canvas /> }));
const printSpy = vi.hoisted(() => vi.fn());
vi.mock('../hooks/usePrint.ts', () => ({ usePrint: () => ({ print: printSpy, sheets: null }) }));

type WorkspaceProps = Parameters<typeof HighlightWorkspace>[0];

/** The workspace with the comments view PdfHighlightTool gives it, over the marks the test supplies. */
function Harness(props: Omit<WorkspaceProps, 'comments' | 'dispatch'>) {
  const { marks } = props;
  const comments = useHighlightComments({ state: marks.state, dispatch: marks.dispatch, logAction: marks.logAction, announce: () => {} });
  return <HighlightWorkspace {...props} comments={comments} dispatch={marks.dispatch} />;
}

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

let redraw: (level: number) => void = () => {};

function mount(lamp: { fullscreen: boolean; pseudoFullscreen: boolean }, elements: EditorElement[] = []) {
  const zoomAt = (level: number) => ({
    zoom: level, setting: 'width', pages: [], board: { boardWidth: 0, slack: 0 },
    apply: vi.fn(), step: vi.fn(), actual: vi.fn(),
  } as unknown as Parameters<typeof HighlightWorkspace>[0]['zoom']);
  const marks = {
    state: { elements }, marker: DEFAULT_MARKER, rearm: vi.fn(), logAction: vi.fn(),
    dispatch: vi.fn(), undo: vi.fn(), redo: vi.fn(), canUndo: false, canRedo: false,
  } as unknown as Parameters<typeof HighlightWorkspace>[0]['marks'];
  container = document.createElement('div');
  document.body.appendChild(container);
  const draw = (level: number) => act(() => render(
    <Harness
      pdfDocument={{} as PDFDocumentProxy} numPages={0} fileName="a.pdf" zoom={zoomAt(level)} marks={marks} undo={vi.fn()} redo={vi.fn()}
      setAnnouncement={vi.fn()} onDownload={vi.fn()} workspaceRef={{ current: null }} columnRef={{ current: null }}
      onToggleFullscreen={vi.fn()} {...lamp}
    />,
    container!,
  ));
  redraw = draw;
  draw(1);
  return container.querySelector<HTMLElement>('[data-workspace]')!;
}

describe('HighlightWorkspace', () => {
  it('in the lamp, a zoom change leaves the capsule as the only place the percent shows', () => {
    mount({ fullscreen: true, pseudoFullscreen: false });
    redraw(2.25);
    const showing = [...container!.querySelectorAll('*')].filter((el) => el.children.length === 0 && /\d+%/.test(el.textContent ?? ''));
    expect(showing).toHaveLength(1);
    expect(showing[0].closest('[role="toolbar"][aria-label="Reading lamp"]')).not.toBeNull();
  });

  it('is a landmark region named by the file, in the normal view and in the lamp (R43)', () => {
    for (const fullscreen of [false, true]) {
      const ws = mount({ fullscreen, pseudoFullscreen: false });
      expect(ws.getAttribute('role')).toBe('region');
      expect(ws.getAttribute('aria-label')).toBe('a.pdf');
      act(() => render(null, container!));
    }
  });

  it('outside the lamp shows the editor card with the tile row, and no capsule; the lamp still has the capsule', () => {
    mount({ fullscreen: false, pseudoFullscreen: false });
    const bar = container!.querySelector('[data-editor-toolbar][role="toolbar"]')!;
    expect(bar).not.toBeNull();
    expect(bar.closest('[data-shell-controls]')).not.toBeNull();
    const names = [...bar.querySelectorAll('button[aria-label], button[title]')].map((b) => b.getAttribute('aria-label') ?? b.getAttribute('title'));
    expect(names).toEqual(['Marker', 'Undo', 'Redo', 'Full screen', 'Replace file', 'Print', 'Download']);
    expect(container!.querySelector('[role="toolbar"][aria-label="Reading lamp"]')).toBeNull();
    act(() => render(null, container!));
    const lamp = mount({ fullscreen: true, pseudoFullscreen: false });
    expect(lamp.querySelector('[role="toolbar"][aria-label="Reading lamp"]')).not.toBeNull();
    const hiddenBar = container!.querySelector('[data-editor-toolbar]')!;
    expect(hiddenBar.closest('[hidden]')).not.toBeNull();
  });

  it('every control in the row carries its word: seven controls leave the room Sign\'s thirteen do not (READ-04)', () => {
    mount({ fullscreen: false, pseudoFullscreen: false });
    const bar = container!.querySelector<HTMLElement>('[data-editor-toolbar]')!;
    const tile = (name: string) => bar.querySelector<HTMLElement>(`button[aria-label="${name}"], button[title="${name}"]`)!;
    for (const name of ['Marker', 'Undo', 'Redo', 'Full screen', 'Replace file', 'Print', 'Download']) {
      expect(tile(name).hasAttribute('data-icon-only'), name).toBe(false);
      expect(tile(name).querySelector(`.${toolbarStyles.label}`)?.textContent, name).toBeTruthy();
    }
    const printWrap = [...bar.children].find((c) => c.contains(tile('Print')))!;
    expect(printWrap.classList.contains(toolbarStyles.dropdown)).toBe(true);
  });

  it('keeps the tool shell mounted in the lamp, hidden, so the page does not stay behind its restore veil', () => {
    mount({ fullscreen: true, pseudoFullscreen: false });
    const shell = container!.querySelector('[data-tool-shell]');
    expect(shell).not.toBeNull();
    expect(shell!.closest('[hidden]')).not.toBeNull();
  });

  it('covers the screen when the lamp stands in for fullscreen, as on an iPhone', () => {
    const ws = mount({ fullscreen: true, pseudoFullscreen: true });
    expect(ws.classList.contains(workspaceStyles['pseudo-fullscreen'])).toBe(true);
    expect(ws.hasAttribute('data-pseudo-fullscreen')).toBe(true);
  });

  it('leaves the page in place in the normal view and in real fullscreen', () => {
    for (const fullscreen of [false, true]) {
      const ws = mount({ fullscreen, pseudoFullscreen: false });
      expect(ws.classList.contains(workspaceStyles['pseudo-fullscreen'])).toBe(false);
      expect(ws.hasAttribute('data-pseudo-fullscreen')).toBe(false);
      act(() => render(null, container!));
    }
  });
});

const mark: HighlightElement = {
  id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};
const note: CommentElement = {
  id: 'c1', type: 'comment', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  comment: 'Check this', anchor: { kind: 'element', elementId: 'h1' },
};

/** A workspace of the given width with one page and these elements; the zoom is 1 and the page 600 px wide. */
function mountNoted(elements: EditorElement[], workspaceWidth: number, extra: Record<string, unknown> = {}, page?: object) {
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function rect() {
    return { ...originalRect.call(this), width: this.hasAttribute('data-workspace') ? workspaceWidth : 0 } as DOMRect;
  };
  vi.stubGlobal('ResizeObserver', class { constructor(private cb: () => void) {} observe() { this.cb(); } disconnect() {} });
  const zoom = {
    zoom: 1, setting: 'width', pages: [{ width: 600, height: 800, textLeft: 0, textRight: 600 }], board: { boardWidth: 600, slack: 0 },
    apply: vi.fn(), step: vi.fn(), actual: vi.fn(),
  } as unknown as Parameters<typeof HighlightWorkspace>[0]['zoom'];
  const marks = {
    state: { elements,activeElementId: null }, marker: DEFAULT_MARKER, rearm: vi.fn(), logAction: vi.fn(),
    dispatch: vi.fn(), undo: vi.fn(), redo: vi.fn(), canUndo: false, canRedo: false,
    pageTurns: {}, ...extra,
  } as unknown as Parameters<typeof HighlightWorkspace>[0]['marks'];
  const workspaceRef = { current: null as HTMLDivElement | null };
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(
    <Harness
      pdfDocument={{ getPage: () => (page ? Promise.resolve(page) : new Promise(() => {})) } as unknown as PDFDocumentProxy} numPages={1} fileName="a.pdf" zoom={zoom} marks={marks} undo={vi.fn()} redo={vi.fn()}
      setAnnouncement={vi.fn()} onDownload={vi.fn()} workspaceRef={workspaceRef} columnRef={{ current: null }}
      onToggleFullscreen={vi.fn()} fullscreen={false} pseudoFullscreen={false}
    />,
    container!,
  ));
  const restore = () => { HTMLElement.prototype.getBoundingClientRect = originalRect; };
  return { workspaceRef, marks, dispatch: marks.dispatch, column: container.querySelector<HTMLElement>('[data-editor-page-card]')!.parentElement!, restore };
}

describe('HighlightWorkspace notes (R28, R29)', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a wide workspace with a saved comment draws the rail inside the page column, beside its page, and widens the column', () => {
    const { column, restore } = mountNoted([mark, note], 1200);
    const card = column.querySelector('[data-editor-page-card]')!;
    expect(card.querySelector('[data-comment-rail]')).not.toBeNull();
    expect(column.style.width).toBe(`${600 + NOTES_W}px`);
    expect(container!.querySelector('[data-comment-sheet]')).toBeNull();
    restore();
  });

  it('a workspace with no comment keeps the page alone', () => {
    const { column, restore } = mountNoted([mark], 1200);
    expect(column.querySelector('[data-comment-rail]')).toBeNull();
    expect(column.style.width).toBe('600px');
    restore();
  });

  it('measures the workspace itself: the same node is the workspace ref and the comments container', () => {
    const { workspaceRef, restore } = mountNoted([mark, note], 1200);
    expect(workspaceRef.current).toBe(container!.querySelector('[data-workspace]'));
    restore();
  });

  it('a narrow workspace has no rail and the column stays at the page width', () => {
    const { column, restore } = mountNoted([mark, note], 700);
    expect(column.querySelector('[data-comment-rail]')).toBeNull();
    expect(column.style.width).toBe('600px');
    restore();
  });

  it('prints at once when there is only one way to print: no comment means no menu, in the row or the lamp', () => {
    for (const fullscreen of [false, true]) {
      printSpy.mockClear();
      const ws = mount({ fullscreen, pseudoFullscreen: false });
      const trigger = (fullscreen ? ws : container!.querySelector('[data-editor-toolbar]')!).querySelector<HTMLElement>('button[aria-label="Print"]')!;
      expect(trigger.hasAttribute('aria-haspopup')).toBe(false);
      act(() => { trigger.click(); });
      expect(printSpy).toHaveBeenCalledWith(false);
      expect(container!.querySelector('[role="menu"]')).toBeNull();
      act(() => render(null, container!));
    }
  });

  it('opens the print menu 8 px under the capsule in the lamp, and under its own tile in the row', () => {
    const row = mount({ fullscreen: false, pseudoFullscreen: false }, [mark, note]);
    act(() => { container!.querySelector<HTMLElement>('[data-editor-toolbar] button[title="Print"], [data-editor-toolbar] button[aria-label="Print"]')!.click(); });
    expect(container!.querySelector('[data-editor-toolbar] [role="menu"]')).not.toBeNull();
    expect(row).toBeTruthy();
    act(() => render(null, container!));
    for (const fullscreen of [true]) {
      const ws = mount({ fullscreen, pseudoFullscreen: false }, [mark, note]);
      const button = ws.querySelector<HTMLElement>('button[aria-label="Print"]')!;
      vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ left: 300, right: 340, bottom: 100 } as DOMRect);
      vi.stubGlobal('innerWidth', 1280);
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(192);
      act(() => { button.click(); });
      const menu = ws.querySelector('[role="menu"]')!;
      expect((menu.parentElement as HTMLElement).style.top).toBe('108px');
      expect((menu.parentElement as HTMLElement).style.left).toBe('300px');
      act(() => render(null, container!));
    }
  });
});

describe('HighlightWorkspace comment markers', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a commented mark wears no comment marker on a phone either', () => {
    const { restore } = mountNoted([mark, note], 700);
    expect(container!.querySelector('[data-comment-marker]')).toBeNull();
    restore();
  });
});

describe('HighlightWorkspace page header (Rotate and Clear page)', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows Rotate and Clear page, and each calls the marks with the page index; Rotate hands over the page as shown', async () => {
    const { dispatch, restore } = mountNoted([mark], 700, {}, { view: [0, 0, 600, 800], rotate: 0, getTextContent: () => Promise.resolve({ items: [] }) });
    await act(async () => { await Promise.resolve(); });
    const header = container!.querySelector<HTMLElement>('[data-editor-page-header]')!;
    const button = (text: string) => [...header.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;
    act(() => { button('Rotate').click(); });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'ROTATE_PAGE', payload: expect.objectContaining({ pageIndex: 0, geometry: expect.objectContaining({ width: 600, height: 800 }) }) }));
    act(() => { button('Clear page').click(); });
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_PAGE', payload: 0 });
    restore();
  });

  it('has no Clear page on a page without marks', () => {
    const { restore } = mountNoted([], 700);
    const header = container!.querySelector<HTMLElement>('[data-editor-page-header]')!;
    expect([...header.querySelectorAll('button')].some((b) => b.textContent?.includes('Clear page'))).toBe(false);
    expect([...header.querySelectorAll('button')].some((b) => b.textContent?.includes('Rotate'))).toBe(true);
    restore();
  });
});
