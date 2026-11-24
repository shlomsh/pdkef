import { render } from 'preact';
import { useReducer } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RedactToolbar from './RedactToolbar.tsx';
import useRedactArming from '../hooks/useRedactArming.ts';
import useRedactUndo from '../hooks/useRedactUndo.ts';
import { canRedo, redactReducer, type EditCommit, type RedactAction, type RedactState } from '../state/redactState.ts';
import { initialRedactStateFromPreferences } from '../lib/initialRedactState.ts';
import type { RedactElement } from '../lib/redactElements.ts';
import { captureAddedElement, createActionEntry } from '#editor/model/actionHistory.ts';
import { FILE_ACTIONS } from '#shell/ToolShell.tsx';
import signStyles from '#editor-ui/SignToolbar.module.css';
// Asserts the editor toolbar button base class, a styling contract.

describe('RedactToolbar returning-work status', () => {
  let container = document.createElement('div');

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    container = document.createElement('div');
  });

  function mount({ activeStyle = null, brushMode = false, restoredNote = false, showWelcomeTip = true, undoAction = null, statusMessage, findOpen = false, peeking = false }: {
    findOpen?: boolean;
    peeking?: boolean;
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
          tool={{ active: activeStyle, locked: false, set: vi.fn(), brushMode }}
          announce={vi.fn()}
          fullscreen={{ active: false, toggle: vi.fn() }}
          output={{ download: vi.fn(), prepareShare: vi.fn(), share: vi.fn() }}
          history={{ entries: [], undo: vi.fn(), redo: vi.fn(), canRedo: false }}
          undoChip={{ action: undoAction }}
          elementsCount={0}
          status={{ message: statusMessage, welcomeTip: showWelcomeTip, restoredNote }}
          find={{ open: findOpen, toggle: vi.fn() }}
          peek={{ active: peeking, onChange: vi.fn() }}
        />,
        container,
      );
    });
  }

  it('Replace is a plain toolbar button, not the row highlight', () => {
    mount();
    const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${FILE_ACTIONS.replace.label}"]`);
    expect(button).not.toBeNull();
    expect(button!.hasAttribute('aria-pressed')).toBe(false);
    expect(button!.hasAttribute('data-locked')).toBe(false);
  });

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
          tool={{ active: 'blackout', locked: false, set: vi.fn() }}
          announce={vi.fn()}
          fullscreen={{ active: false, toggle: vi.fn() }}
          output={{ download: vi.fn(), prepareShare: vi.fn(), share: vi.fn() }}
          history={{ entries: [], undo: vi.fn(), redo: vi.fn(), canRedo: false }}
          elementsCount={0}
          status={{ welcomeTip: false }}
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
    expect(container.textContent).not.toContain('Compress');
  });

  it('RED-73: Undo and Redo are icon-only, no tool button is', () => {
    mount();
    const iconOnly = Array.from(container.querySelectorAll('[data-icon-only]')).map((b) => b.textContent);
    expect(iconOnly).toEqual(['Undo', 'Redo']);
    for (const word of ['Blur', 'Blackout', 'Whiteout', 'Delete', 'Find', 'Peek']) {
      expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.includes(word))).toBe(true);
    }
  });

  it('RED-73: the root takes the strip finish with stacked words', () => {
    mount();
    const root = container.querySelector('[data-editor-toolbar]')!;
    expect(root.getAttribute('data-finish')).toBe('strip');
    expect(root.getAttribute('data-labels')).toBe('stack');
  });

  it('RED-73: Find and Undo start a group, nothing else does; Replace is marked', () => {
    mount();
    const root = container.querySelector('[data-editor-toolbar]')!;
    const starts = Array.from(root.children).filter((c) => c.hasAttribute('data-group-start')).map((c) => c.textContent?.trim());
    expect(starts).toEqual(['Find', 'Undo']);
    expect(container.querySelector('[data-redact-find-toggle]')!.hasAttribute('data-group-start')).toBe(true);
    expect(container.querySelector(`button[aria-label="${FILE_ACTIONS.replace.label}"]`)!.hasAttribute('data-replace')).toBe(true);
  });

  it('RED-73: Find open and Peek held never wear the armed class', () => {
    mount({ findOpen: true, peeking: true });
    const find = container.querySelector<HTMLElement>('[data-redact-find-toggle]')!;
    const peek = container.querySelector<HTMLElement>('[data-redact-peek]')!;
    expect(find.getAttribute('aria-pressed')).toBe('true');
    expect(peek.getAttribute('aria-pressed')).toBe('true');
    expect(signStyles.active).toBeTruthy();
    expect(find.classList.contains(signStyles.active)).toBe(false);
    expect(peek.classList.contains(signStyles.active)).toBe(false);
  });

  it('has one plain Full screen button and no view density control', () => {
    mount();
    const toolbar = container.querySelector('[role="toolbar"]')!;
    expect(toolbar.querySelector('[role="radiogroup"]')).toBeNull();
    expect(Array.from(toolbar.querySelectorAll('button')).filter((b) => b.textContent?.trim() === 'Full screen')).toHaveLength(1);
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
    const buttons = Array.from(container.querySelectorAll('[role="status"] button'));
    expect(buttons.map((b) => b.textContent)).toEqual(['Every page', 'Undo']);
    buttons[0].click();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('RedactToolbar over the real arming, undo and reducer', () => {
  let container = document.createElement('div');
  let latest: { state: RedactState; dispatch: (action: RedactAction) => void };

  function Wired() {
    const [state, dispatch] = useReducer(redactReducer, undefined, initialRedactStateFromPreferences);
    latest = { state, dispatch };
    const arming = useRedactArming({ state, dispatch });
    const undo = useRedactUndo({ state, dispatch });
    return (
      <RedactToolbar
        tool={{ active: state.tool.activeStyle, locked: state.tool.toolLocked, set: arming.setTool }}
        announce={(message) => dispatch({ type: 'ANNOUNCED', message })}
        fullscreen={{ active: false, toggle: () => {} }}
        output={{ download: () => {}, prepareShare: () => {}, share: () => {} }}
        history={{ entries: state.edits.history.past, undo: undo.undoLast, redo: undo.redoLast, canRedo: canRedo(state) }}
        elementsCount={state.edits.elements.length}
        peek={{ active: arming.peekAll, onChange: arming.setPeekAll }}
      />
    );
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.appendChild(container);
    act(() => render(<Wired />, container));
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    container = document.createElement('div');
  });

  const toolButton = (label: string) => {
    const button = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
      .find((b) => b.querySelector('span')?.textContent === label);
    if (!button) throw new Error(`no ${label} button`);
    return button;
  };
  const click = (button: HTMLElement, detail = 1) => act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }));
  });
  const statusChip = () => container.querySelector<HTMLButtonElement>('[data-tool-status] [role="status"] button')!;
  const toolbarButton = (title: string) => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
    .find((b) => b.title === title)!;

  const box = (id: string): RedactElement => ({ id, pageIndex: 0, type: 'blackout', left: 10, top: 10, width: 20, height: 10 });
  const addBox = (id: string, index: number) => {
    const added = box(id);
    const commit: EditCommit<RedactElement> = {
      edit: { kind: 'add', additions: [added] },
      entry: createActionEntry<RedactElement>({
        operation: 'add', type: 'ADD_BLACKOUT', pageIndex: 0, description: 'Added blackout box', elements: [captureAddedElement(added, index)],
      }),
    };
    act(() => latest.dispatch({ type: 'EDIT_COMMITTED', ...commit }));
  };

  it('names the armed tool in the status chip, and clicking the chip locks it', () => {
    click(toolButton('Blackout'));
    expect(statusChip().textContent).toContain('Keep Blackout on');
    expect(statusChip().getAttribute('aria-checked')).toBe('false');

    click(statusChip());

    expect(statusChip().getAttribute('aria-checked')).toBe('true');
    expect(toolButton('Blackout').hasAttribute('data-locked')).toBe(true);
  });

  it('does not describe the Delete tool as adding anything', () => {
    click(toolButton('Delete'));
    expect(statusChip().textContent).toContain('Keep Delete on');
    expect(statusChip().textContent).not.toContain('adding');
  });

  it('gives a tool button no native title, and its hint carries the action and the shortcut', () => {
    const deleteButton = toolButton('Delete');
    expect(deleteButton.hasAttribute('title')).toBe(false);

    act(() => deleteButton.focus());

    const describedBy = deleteButton.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const hint = document.getElementById(describedBy!);
    expect(hint?.textContent).toContain('Click text or an image to delete it, or drag across several');
    expect(hint?.textContent).toContain('Double-click to keep Delete on');
  });

  it('drops the hint and its aria-describedby once the tool is locked', () => {
    const deleteButton = toolButton('Delete');
    click(deleteButton);
    click(deleteButton, 2);
    expect(deleteButton.hasAttribute('data-locked')).toBe(true);

    act(() => deleteButton.focus());

    expect(deleteButton.hasAttribute('aria-describedby')).toBe(false);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('keeps Undo and Redo disabled with nothing to undo', () => {
    expect(toolbarButton('Undo').disabled).toBe(true);
    expect(toolbarButton('Redo').disabled).toBe(true);
  });

  it('undoes and redoes one step per tap, opening no dialog', () => {
    addBox('a', 0);
    addBox('b', 1);
    expect(toolbarButton('Undo').disabled).toBe(false);
    expect(toolbarButton('Redo').disabled).toBe(true);

    click(toolbarButton('Undo'));
    expect(latest.state.edits.elements.map((el) => el.id)).toEqual(['a']);
    expect(container.querySelector('dialog[open]')).toBeNull();
    expect(document.querySelector('dialog[open]')).toBeNull();

    expect(toolbarButton('Redo').disabled).toBe(false);
    click(toolbarButton('Redo'));
    expect(latest.state.edits.elements.map((el) => el.id)).toEqual(['a', 'b']);
    expect(toolbarButton('Redo').disabled).toBe(true);
  });

  it('takes two undo keydowns in one task as two distinct undos, and two redos bring both back once each', () => {
    addBox('a', 0);
    addBox('b', 1);
    const key = (init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));

    act(() => {
      key({ key: 'z', ctrlKey: true });
      key({ key: 'z', ctrlKey: true });
    });
    expect(latest.state.edits.elements).toEqual([]);

    act(() => { key({ key: 'z', ctrlKey: true, shiftKey: true }); });
    act(() => { key({ key: 'z', ctrlKey: true, shiftKey: true }); });
    expect(latest.state.edits.elements.map((el) => el.id)).toEqual(['a', 'b']);
  });

  it('keeps a long press on Peek from starting a text selection or a callout', () => {
    const label = container.querySelector('[data-redact-peek] span')!;
    for (const type of ['selectstart', 'touchstart', 'contextmenu']) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      label.dispatchEvent(event);
      expect(event.defaultPrevented, type).toBe(true);
    }
  });
});
