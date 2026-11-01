import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workspaceStyles from '#editor-ui/Workspace.module.css';
import HighlightWorkspace from './HighlightWorkspace.tsx';
import type { CommentElement, EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { DEFAULT_MARKER } from '../lib/marker/markerState.ts';
import { NOTES_W } from '../lib/zoom/fit.ts';

vi.mock('#editor-ui/PdfPageCanvas.tsx', () => ({ default: () => <canvas data-canvas /> }));

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(lamp: { fullscreen: boolean; pseudoFullscreen: boolean }) {
  const zoom = {
    zoom: 1, setting: 'width', pages: [], board: { boardWidth: 0, slack: 0 },
    apply: vi.fn(), step: vi.fn(), actual: vi.fn(),
  } as unknown as Parameters<typeof HighlightWorkspace>[0]['zoom'];
  const marks = {
    state: { elements: [] }, marker: DEFAULT_MARKER, rearm: vi.fn(), logAction: vi.fn(),
    dispatch: vi.fn(), undo: vi.fn(), redo: vi.fn(), canUndo: false, canRedo: false,
  } as unknown as Parameters<typeof HighlightWorkspace>[0]['marks'];
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(
    <HighlightWorkspace
      pdfDocument={{} as PDFDocumentProxy} numPages={0} fileName="a.pdf" zoom={zoom} marks={marks}
      setAnnouncement={vi.fn()} onDownload={vi.fn()} workspaceRef={{ current: null }} columnRef={{ current: null }}
      onToggleFullscreen={vi.fn()} {...lamp}
    />,
    container!,
  ));
  return container.querySelector<HTMLElement>('[data-workspace]')!;
}

describe('HighlightWorkspace', () => {
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
function mountNoted(elements: EditorElement[], workspaceWidth: number) {
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
    state: { elements, activeElementId: null }, marker: DEFAULT_MARKER, rearm: vi.fn(), logAction: vi.fn(),
    dispatch: vi.fn(), undo: vi.fn(), redo: vi.fn(), canUndo: false, canRedo: false,
  } as unknown as Parameters<typeof HighlightWorkspace>[0]['marks'];
  const workspaceRef = { current: null as HTMLDivElement | null };
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(
    <HighlightWorkspace
      pdfDocument={{ getPage: () => new Promise(() => {}) } as unknown as PDFDocumentProxy} numPages={1} fileName="a.pdf" zoom={zoom} marks={marks}
      setAnnouncement={vi.fn()} onDownload={vi.fn()} workspaceRef={workspaceRef} columnRef={{ current: null }}
      onToggleFullscreen={vi.fn()} fullscreen={false} pseudoFullscreen={false}
    />,
    container!,
  ));
  const restore = () => { HTMLElement.prototype.getBoundingClientRect = originalRect; };
  return { workspaceRef, column: container.querySelector<HTMLElement>('[data-editor-page-card]')!.parentElement!, restore };
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
});
