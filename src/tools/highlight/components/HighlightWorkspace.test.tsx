import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workspaceStyles from '#editor-ui/Workspace.module.css';
import HighlightWorkspace from './HighlightWorkspace.tsx';

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
    elements: [], dispatch: vi.fn(), undo: vi.fn(), redo: vi.fn(), canUndo: false, canRedo: false,
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
