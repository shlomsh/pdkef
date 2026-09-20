import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import UndoHistoryModal from './UndoHistoryModal.tsx';
import type { ActionHistoryEntry } from '../editor/model/actionHistory.ts';
import styles from './UndoHistoryModal.module.css';
import dialogStyles from '../shell/Dialog.module.css';

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

// Redo is a toolbar control in both tools, not a dialog one: this dialog is
// unreachable while it is closed, so a Redo that lived only here was, on a
// phone, no redo at all. It had a footer button during the one change where
// the toolbar's single history control still opened this dialog; these guard
// that it did not come back and leave two controls doing one job.
describe('UndoHistoryModal footer', () => {
  let container = document.createElement('div');

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    document.body.innerHTML = '';
  });

  function footerButtons() {
    return Array.from(container.querySelectorAll<HTMLButtonElement>(`.${dialogStyles.footer} button`));
  }

  it('offers only "Revert selected" - redo belongs to the toolbar', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<UndoHistoryModal {...baseProps({ redoHistory: REDO_HISTORY })} />, container);
    });

    expect(footerButtons().map((b) => b.textContent?.trim())).toEqual(['Revert selected']);
  });

  it('disables "Revert selected" until something is checked', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<UndoHistoryModal {...baseProps()} />, container);
    });

    expect(required(footerButtons()[0], 'Revert selected button').disabled).toBe(true);

    act(() => {
      render(<UndoHistoryModal {...baseProps({ undoSelection: new Set(['a1']) })} />, container);
    });
    expect(required(footerButtons()[0], 'Revert selected button').disabled).toBe(false);
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
