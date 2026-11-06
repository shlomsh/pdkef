import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UndoChip from './UndoChip.tsx';

describe('UndoChip', () => {
  let container: HTMLElement;
  afterEach(() => {
    render(null, container);
    container.remove();
  });

  function mount(props: Partial<Parameters<typeof UndoChip>[0]> = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    const onUndo = vi.fn();
    act(() => render(<UndoChip message="Removed" undoLabel="Undo" onUndo={onUndo} {...props} />, container));
    return onUndo;
  }

  it('shows the message and the undo label', () => {
    mount();
    expect(container.querySelector('span')?.textContent).toBe('Removed');
    expect(container.querySelector('button')?.textContent).toBe('Undo');
  });

  it('carries data-undo-chip', () => {
    mount();
    expect(container.querySelector('[data-undo-chip]')).not.toBeNull();
  });

  it('Undo calls onUndo', () => {
    const onUndo = mount();
    act(() => container.querySelector('button')!.click());
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('passes class and style to the chip', () => {
    mount({ class: 'extra', style: { top: '10px' } });
    const chip = container.querySelector('[data-undo-chip]') as HTMLElement;
    expect(chip.classList.contains('extra')).toBe(true);
    expect(chip.style.top).toBe('10px');
  });
});
