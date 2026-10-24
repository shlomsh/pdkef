import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HistoryButtons from './HistoryButtons.tsx';

const labels = { undo: 'Undo', redo: 'Redo', undoLabel: 'Undo last change', redoLabel: 'Redo last undone change' };

describe('HistoryButtons', () => {
  let container: HTMLElement;
  afterEach(() => {
    render(null, container);
    container.remove();
  });

  function mount(props: { canUndo: boolean; canRedo: boolean; onUndo?: () => void; onRedo?: () => void }) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(
      <HistoryButtons onUndo={() => {}} onRedo={() => {}} labels={labels} {...props} />,
      container,
    ));
  }
  const button = (aria: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${aria}"]`)!;

  it('names each button with its label and aria-label', () => {
    mount({ canUndo: true, canRedo: true });
    expect(button('Undo last change').textContent).toBe('Undo');
    expect(button('Redo last undone change').textContent).toBe('Redo');
  });

  it('disables a button that cannot act', () => {
    mount({ canUndo: false, canRedo: true });
    expect(button('Undo last change').disabled).toBe(true);
    expect(button('Redo last undone change').disabled).toBe(false);
  });

  it('calls the matching handler on click', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    mount({ canUndo: true, canRedo: true, onUndo, onRedo });
    act(() => button('Undo last change').click());
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();
    act(() => button('Redo last undone change').click());
    expect(onRedo).toHaveBeenCalledTimes(1);
  });
});
