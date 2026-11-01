import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHistoryKeys } from './useHistoryKeys.ts';

let container: HTMLElement | null = null;
const undo = vi.fn();
const redo = vi.fn();

function Probe({ enabled = true }: { enabled?: boolean }) {
  useHistoryKeys({ enabled, undo, redo });
  return <input data-field />;
}

function mount(enabled = true) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<Probe enabled={enabled} />, container!));
}

function press(init: KeyboardEventInit, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  undo.mockClear();
  redo.mockClear();
});

describe('useHistoryKeys', () => {
  it('undoes on mod+Z and redoes on shift+mod+Z and ctrl+Y', () => {
    mount();
    expect(press({ key: 'z', metaKey: true }).defaultPrevented).toBe(true);
    press({ key: 'z', ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(2);
    press({ key: 'z', metaKey: true, shiftKey: true });
    press({ key: 'y', ctrlKey: true });
    expect(redo).toHaveBeenCalledTimes(2);
  });

  it('leaves the keys to a field the person is typing in', () => {
    mount();
    press({ key: 'z', metaKey: true }, container!.querySelector('[data-field]')!);
    expect(undo).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    mount(false);
    press({ key: 'z', metaKey: true });
    expect(undo).not.toHaveBeenCalled();
  });
});
