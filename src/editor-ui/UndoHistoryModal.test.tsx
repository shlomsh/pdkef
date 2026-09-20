import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import UndoHistoryModal from './UndoHistoryModal.tsx';
import type { ActionHistoryEntry } from '../editor/model/actionHistory.ts';

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
