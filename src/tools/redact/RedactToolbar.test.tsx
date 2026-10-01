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

  function mount({ activeStyle = null, brushMode = false, restoredNote = false, showWelcomeTip = true, undoAction = null, statusMessage }: {
    activeStyle?: 'delete' | 'blackout' | 'whiteout' | 'blur' | null;
    brushMode?: boolean;
    restoredNote?: boolean;
    showWelcomeTip?: boolean;
    undoAction?: { message: string; extra?: { label: string; onSelect: () => void } } | null;
    statusMessage?: string;
  } = {}) {
    document.body.appendChild(container);
    act(() => {
      render(
        <RedactToolbar
          activeStyle={activeStyle}
          brushMode={brushMode}
          restoredNote={restoredNote}
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

  it('RED-45: reopened work says it is back; a fresh file and an edited one do not', () => {
    mount({ showWelcomeTip: false, restoredNote: true });
    expect(container.textContent).toContain('Your changes from last time are back.');
    mount({ showWelcomeTip: false, restoredNote: false });
    expect(container.textContent).not.toContain('from last time');
  });

  it('RED-42: an armed brush shows its hint and no keep-on switch; box mode keeps it', () => {
    mount({ activeStyle: 'blur', brushMode: true });
    expect(container.textContent).toContain('Click and drag to paint a blur.');
    expect(container.querySelector('[role="switch"]')).toBeNull();
    // The hint that names the same setting goes with it; only hidden reservations keep it.
    const visibleHints = [...container.querySelectorAll('[role="status"] *')].filter((n) => n.textContent === 'or double-click Blur');
    expect(visibleHints).toHaveLength(0);
    mount({ activeStyle: 'blur', brushMode: false });
    expect(container.querySelector('[role="switch"]')?.textContent).toContain('Keep Blur on');
    expect([...container.querySelectorAll('[role="status"] *')].some((n) => n.textContent === 'or double-click Blur')).toBe(true);
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

  it('puts the extra chip action before Undo', () => {
    const onSelect = vi.fn();
    mount({ undoAction: { message: 'Deleted an image, also on 4 other pages', extra: { label: 'Every page', onSelect } } });
    const buttons = Array.from(container.querySelectorAll('button')).filter((b) => b.className.includes('undo-chip-btn'));
    expect(buttons.map((b) => b.textContent)).toEqual(['Every page', 'Undo']);
    buttons[0].click();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
