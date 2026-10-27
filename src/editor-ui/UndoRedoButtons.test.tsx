import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UndoRedoButtons from './UndoRedoButtons.tsx';

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) act(() => render(null, host!));
  host?.remove();
  host = null;
});
function mount(props: Partial<Parameters<typeof UndoRedoButtons>[0]> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const onUndo = vi.fn();
  const onRedo = vi.fn();
  act(() => render(<UndoRedoButtons onUndo={onUndo} onRedo={onRedo} canUndo canRedo {...props} />, host!));
  return { onUndo, onRedo, buttons: Array.from(host.querySelectorAll<HTMLButtonElement>('button')) };
}

describe('UndoRedoButtons', () => {
  it('renders two buttons, Undo then Redo, named in English by default', () => {
    const { buttons } = mount();
    expect(buttons.map((b) => b.title)).toEqual(['Undo', 'Redo']);
    expect(buttons.map((b) => b.textContent)).toEqual(['Undo', 'Redo']);
    expect(buttons.every((b) => !b.hasAttribute('data-icon-only'))).toBe(true);
  });

  it('calls its handlers and disables each side independently', () => {
    const { buttons, onUndo, onRedo } = mount({ canRedo: false });
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[1].disabled).toBe(true);
    act(() => buttons[0].click());
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('takes a translated label set and the icon-only marker', () => {
    const { buttons } = mount({ iconOnly: true, labels: { undoTitle: 'a', undoButton: 'b', redoTitle: 'c', redoButton: 'd' } });
    expect(buttons.map((b) => b.title)).toEqual(['a', 'c']);
    expect(buttons.map((b) => b.textContent)).toEqual(['b', 'd']);
    expect(buttons.every((b) => b.hasAttribute('data-icon-only'))).toBe(true);
  });
});
