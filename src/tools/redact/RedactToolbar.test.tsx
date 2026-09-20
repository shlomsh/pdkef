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

  function mount({ activeStyle = null, showWelcomeTip = true }: {
    activeStyle?: 'delete' | 'blackout' | 'whiteout' | 'blur' | null;
    showWelcomeTip?: boolean;
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
          setUndoModalOpen={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          canRedo={false}
          showWelcomeTip={showWelcomeTip}
        />,
        container,
      );
    });
  }

  it('keeps the neutral starter tip for a manually opened file', () => {
    mount();
    expect(container.textContent).toContain('Tip: pick a tool to start.');
  });

  it('hides the neutral tip for restored work but preserves the armed-tool instruction and Keep control', () => {
    mount({ showWelcomeTip: false });
    expect(container.textContent).not.toContain('Tip: pick a tool to start.');

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
          setUndoModalOpen={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          canRedo={false}
          showWelcomeTip={false}
        />,
        container,
      );
    });

    expect(container.textContent).toContain('Click and drag on a page to draw a blackout box.');
    const keep = container.querySelector<HTMLButtonElement>('[role="switch"]');
    expect(keep?.textContent).toContain('Keep Blackout on');
    expect(keep?.getAttribute('aria-checked')).toBe('false');
  });
});
