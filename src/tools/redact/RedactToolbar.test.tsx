import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RedactToolbar from './RedactToolbar.tsx';

describe('RedactToolbar returning-work status', () => {
  let container = document.createElement('div');

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    container = document.createElement('div');
  });

  function mount({ activeStyle = null, showWelcomeTip = true, undoAction = null, statusMessage }: {
    activeStyle?: 'delete' | 'blackout' | 'whiteout' | 'blur' | null;
    showWelcomeTip?: boolean;
    undoAction?: { message: string } | null;
    statusMessage?: string;
  } = {}) {
    document.body.appendChild(container);
    act(() => {
      render(
        <RedactToolbar
          activeStyle={activeStyle}
          toolLocked={false}
          setTool={vi.fn()}
          setAnnouncement={vi.fn()}
          toggleFullscreen={vi.fn()}
          isFullscreen={false}
          handleDownloadPdf={vi.fn()}
          handlePrepareShare={vi.fn()}
          handleSharePdf={vi.fn()}
          elementsCount={0}
          actionHistory={[]}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          canRedo={false}
          showWelcomeTip={showWelcomeTip}
          undoAction={undoAction}
          statusMessage={statusMessage}
        />,
        container,
      );
    });
  }

  it('keeps the neutral starter tip for a manually opened file', () => {
    mount();
    expect(container.textContent).toContain('Tip: pick a tool.');
  });

  it('hides the neutral tip for restored work but preserves the armed-tool instruction and Keep control', () => {
    mount({ showWelcomeTip: false });
    expect(container.textContent).not.toContain('Tip: pick a tool.');

    act(() => {
      render(
        <RedactToolbar
          activeStyle="blackout"
          toolLocked={false}
          setTool={vi.fn()}
          setAnnouncement={vi.fn()}
          toggleFullscreen={vi.fn()}
          isFullscreen={false}
          handleDownloadPdf={vi.fn()}
          handlePrepareShare={vi.fn()}
          handleSharePdf={vi.fn()}
          elementsCount={0}
          actionHistory={[]}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          canRedo={false}
          showWelcomeTip={false}
        />,
        container,
      );
    });

    expect(container.textContent).toContain('Click and drag to draw a blackout box.');
    const keep = container.querySelector<HTMLButtonElement>('[role="switch"]');
    expect(keep?.textContent).toContain('Keep Blackout on');
    expect(keep?.getAttribute('aria-checked')).toBe('false');
  });

  it('shows a visible word on every control, Undo and Redo included', () => {
    mount();
    const labels = Array.from(container.querySelectorAll('[role="toolbar"] button')).map((b) => b.textContent);
    for (const word of ['Blur', 'Blackout', 'Whiteout', 'Delete', 'Undo', 'Redo']) {
      expect(labels.some((t) => t?.includes(word))).toBe(true);
    }
    expect(container.querySelector('[data-icon-only]')).toBeNull();
    expect(container.textContent).not.toContain('Compress');
  });

  it('shows the island status message in the slot', () => {
    mount({ statusMessage: 'Preparing your file' });
    expect(container.textContent).toContain('Preparing your file');
  });

  it('lets the undo chip win the slot over the status message', () => {
    mount({ undoAction: { message: 'Deleted text' }, statusMessage: 'Preparing your file' });
    expect(container.textContent).toContain('Deleted text');
    expect(container.textContent).not.toContain('Preparing your file');
  });
});
