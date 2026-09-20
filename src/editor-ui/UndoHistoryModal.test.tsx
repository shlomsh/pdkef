import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import UndoHistoryModal from './UndoHistoryModal.tsx';
import type { ActionHistoryEntry } from '../editor/model/actionHistory.ts';
import styles from './UndoHistoryModal.module.css';

// jsdom doesn't implement the dialog element's showModal()/close(); stub them
// the same way SignatureDialog.test.tsx does, since UndoHistoryModal.tsx calls
// showModal() unconditionally (deliberately - see its module doc comment).
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.open = false; });
});

function required<T>(value: T | null | undefined, description: string): T {
  if (value == null) throw new Error(`Expected ${description}`);
  return value;
}

const ACTION_HISTORY: ActionHistoryEntry[] = [
  {
    id: 'a1',
    type: 'text',
    operation: 'add',
    pageIndex: 0,
    description: 'Added text box',
    timestamp: Date.now(),
    elements: [],
  },
];

function baseProps(overrides: Partial<Parameters<typeof UndoHistoryModal>[0]> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    actionHistory: ACTION_HISTORY,
    undoSelection: new Set<string>(),
    setUndoSelection: vi.fn(),
    onRevertSelected: vi.fn(),
    ...overrides,
  };
}

describe('UndoHistoryModal redo affordance', () => {
  let container = document.createElement('div');

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    document.body.innerHTML = '';
  });

  function findRedoButton() {
    return Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Redo',
    );
  }

  it('renders no redo button when onRedo is not supplied', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<UndoHistoryModal {...baseProps()} />, container);
    });

    expect(findRedoButton()).toBeUndefined();
  });

  it('renders the redo button disabled when canRedo is false', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const onRedo = vi.fn();
    act(() => {
      render(<UndoHistoryModal {...baseProps({ onRedo, canRedo: false })} />, container);
    });

    const redoButton = required(findRedoButton(), 'redo button');
    expect(redoButton.disabled).toBe(true);
  });

  it('calls onRedo when the enabled redo button is clicked', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const onRedo = vi.fn();
    act(() => {
      render(<UndoHistoryModal {...baseProps({ onRedo, canRedo: true, redoDescription: 'Added text box' })} />, container);
    });

    const redoButton = required(findRedoButton(), 'redo button');
    expect(redoButton.disabled).toBe(false);
    act(() => {
      redoButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it("names what it would bring back in the button's accessible name", () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const onRedo = vi.fn();
    act(() => {
      render(<UndoHistoryModal {...baseProps({ onRedo, canRedo: true, redoDescription: 'Added text box' })} />, container);
    });

    const redoButton = required(findRedoButton(), 'redo button');
    expect(redoButton.getAttribute('aria-label')).toBe('Redo: Added text box');
  });

  it('does not claim a description in its accessible name while there is nothing to redo', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const onRedo = vi.fn();
    act(() => {
      render(<UndoHistoryModal {...baseProps({ onRedo, canRedo: false, redoDescription: 'Added text box' })} />, container);
    });

    const redoButton = required(findRedoButton(), 'redo button');
    expect(redoButton.getAttribute('aria-label')).toBeNull();
  });

  it('keeps "Revert selected" as the footer\'s primary action beside redo', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<UndoHistoryModal {...baseProps({ onRedo: vi.fn(), canRedo: true, redoDescription: 'Added text box' })} />, container);
    });

    const revertButton = required(
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === 'Revert selected'),
      'Revert selected button',
    );
    expect(revertButton).not.toBeNull();
  });
});

// historyStack.ts's `future` is newest-undone-first: [nextRedo, ...older].
// `redoHistory[0]` ("Newest undone") is what Redo acts on next, so it must
// render immediately above the divider - the reversed order this whole
// timeline depends on getting right.
const REDO_HISTORY: ActionHistoryEntry[] = [
  {
    id: 'r-newest',
    type: 'text',
    operation: 'add',
    pageIndex: 0,
    description: 'Newest undone',
    timestamp: Date.now(),
    elements: [],
  },
  {
    id: 'r-oldest',
    type: 'text',
    operation: 'delete',
    pageIndex: 0,
    description: 'Oldest undone',
    timestamp: Date.now(),
    elements: [],
  },
];

describe('UndoHistoryModal change history timeline', () => {
  let container = document.createElement('div');

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    document.body.innerHTML = '';
  });

  function rowDescriptions() {
    return Array.from(container.querySelectorAll(`.${styles['undo-history-desc']}`)).map(
      (el) => el.textContent?.trim(),
    );
  }

  it('renders no divider and no undone rows when the future is empty', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<UndoHistoryModal {...baseProps()} />, container);
    });

    expect(container.querySelector(`.${styles['undo-history-divider']}`)).toBeNull();
    expect(container.querySelector(`.${styles['undo-history-item--undone']}`)).toBeNull();
    expect(rowDescriptions()).toEqual(['Added text box']);
  });

  it('renders undone steps above the divider, newest-at-top, with future[0] adjacent to the divider', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<UndoHistoryModal {...baseProps({ redoHistory: REDO_HISTORY })} />, container);
    });

    // Reading top to bottom: the older undone step first, the one Redo would
    // bring back next ("Newest undone") right above the divider, then the
    // divider, then the applied step below it.
    expect(rowDescriptions()).toEqual(['Oldest undone', 'Newest undone', 'Added text box']);

    const divider = required(container.querySelector(`.${styles['undo-history-divider']}`), 'divider');
    const rows = Array.from(container.querySelectorAll(`.${styles['undo-history-item']}`));
    const dividerIndex = Array.from(container.querySelectorAll(`.${styles['undo-history-list']} > *`)).findIndex(
      (el) => el === divider,
    );
    const newestUndoneRow = required(
      rows.find((row) => row.textContent?.includes('Newest undone')),
      'newest undone row',
    );
    const listChildren = Array.from(container.querySelectorAll(`.${styles['undo-history-list']} > *`));
    expect(listChildren[dividerIndex - 1]).toBe(newestUndoneRow);
  });

  it('gives undone rows no checkbox while applied rows keep theirs', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<UndoHistoryModal {...baseProps({ redoHistory: REDO_HISTORY })} />, container);
    });

    const undoneRows = Array.from(container.querySelectorAll(`.${styles['undo-history-item--undone']}`));
    expect(undoneRows).toHaveLength(2);
    for (const row of undoneRows) {
      expect(row.querySelector('input[type="checkbox"]')).toBeNull();
    }

    const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(checkboxes).toHaveLength(ACTION_HISTORY.length);
  });

  it("marks an undone row as undone with visible text, not color alone", () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<UndoHistoryModal {...baseProps({ redoHistory: REDO_HISTORY })} />, container);
    });

    const badges = Array.from(container.querySelectorAll(`.${styles['undo-history-badge']}`));
    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      expect(badge.textContent?.trim()).toBe('Undone');
    }
  });
});
