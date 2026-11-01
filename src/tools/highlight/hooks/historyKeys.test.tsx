import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHistoryShortcuts } from '#lib/history/useHistoryShortcuts.js';

let container: HTMLElement | null = null;
const undo = vi.fn();
const redo = vi.fn();

function Probe({ enabled = true }: { enabled?: boolean }) {
  // The wiring PdfHighlightTool uses: handlers only while editing.
  useHistoryShortcuts(enabled ? undo : undefined, enabled ? redo : undefined);
  return <input data-field />;
}

function mount(enabled = true) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<Probe enabled={enabled} />, container!));
}

function press(init: KeyboardEventInit, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  (target === document.body ? window : target).dispatchEvent(event);
  return event;
}

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  undo.mockClear();
  redo.mockClear();
});

describe('Highlight history keys', () => {
  it('undoes on mod+Z and redoes on shift+mod+Z and ctrl+Y', () => {
    mount();
    expect(press({ key: 'z', metaKey: true }).defaultPrevented).toBe(true);
    press({ key: 'z', ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(2);
    press({ key: 'z', metaKey: true, shiftKey: true });
    press({ key: 'y', ctrlKey: true });
    expect(redo).toHaveBeenCalledTimes(2);
  });

  it('leaves Cmd+Y to the browser', () => {
    mount();
    expect(press({ key: 'y', metaKey: true }).defaultPrevented).toBe(false);
    expect(redo).not.toHaveBeenCalled();
  });

  it('ignores Alt chords', () => {
    mount();
    press({ key: 'z', ctrlKey: true, altKey: true });
    expect(undo).not.toHaveBeenCalled();
  });

  it('leaves the keys to a field the person is typing in', () => {
    mount();
    const field = container!.querySelector<HTMLInputElement>('[data-field]')!;
    field.focus();
    press({ key: 'z', metaKey: true }, field);
    expect(undo).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    mount(false);
    press({ key: 'z', metaKey: true });
    expect(undo).not.toHaveBeenCalled();
  });
});
