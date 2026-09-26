import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { useHistoryShortcuts } from './useHistoryShortcuts.js';

// No @testing-library/preact-hooks in this repo - see useObjectUrls.test.jsx
// for the same tiny-harness pattern used for hook tests elsewhere. Real
// window keydown events are dispatched below: no other test in this repo
// exercises the metaKey/ctrlKey path this hook reads.
function Harness({ onUndo, onRedo }) {
  useHistoryShortcuts(onUndo, onRedo);
  return null;
}

function dispatchKeyDown(init) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

describe('useHistoryShortcuts', () => {
  let container;
  let onUndo;
  let onRedo;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    onUndo = vi.fn();
    onRedo = vi.fn();
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  it('a chord pressed before the re-render effects flush reaches the newest handler', () => {
    act(() => render(<Harness onUndo={onUndo} onRedo={onRedo} />, container));
    const latestRedo = vi.fn();
    // A plain render (no act) commits the new props but leaves effects
    // pending, which is the gap a real Redo right after an Undo lands in.
    render(<Harness onUndo={onUndo} onRedo={latestRedo} />, container);
    dispatchKeyDown({ key: 'z', metaKey: true, shiftKey: true });
    expect(latestRedo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('Cmd+Z undoes and does not redo', () => {
    act(() => render(<Harness onUndo={onUndo} onRedo={onRedo} />, container));
    act(() => dispatchKeyDown({ key: 'z', metaKey: true }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('Ctrl+Z undoes (non-Mac modifier)', () => {
    act(() => render(<Harness onUndo={onUndo} onRedo={onRedo} />, container));
    act(() => dispatchKeyDown({ key: 'z', ctrlKey: true }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('Shift+Cmd+Z redoes and does NOT undo (the bug this hook fixes)', () => {
    act(() => render(<Harness onUndo={onUndo} onRedo={onRedo} />, container));
    act(() => dispatchKeyDown({ key: 'z', metaKey: true, shiftKey: true }));
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('Shift+Ctrl+Z redoes and does NOT undo', () => {
    act(() => render(<Harness onUndo={onUndo} onRedo={onRedo} />, container));
    act(() => dispatchKeyDown({ key: 'z', ctrlKey: true, shiftKey: true }));
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('Ctrl+Y redoes', () => {
    act(() => render(<Harness onUndo={onUndo} onRedo={onRedo} />, container));
    act(() => dispatchKeyDown({ key: 'y', ctrlKey: true }));
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  // Cmd+Y is the browser's on macOS (History in Safari, Library in Firefox),
  // so taking it would silently swallow those: this handler calls
  // preventDefault as soon as a chord matches.
  it('leaves Cmd+Y to the browser', () => {
    act(() => render(<Harness onUndo={onUndo} onRedo={onRedo} />, container));
    const event = dispatchKeyDown({ key: 'y', metaKey: true });
    expect(onRedo).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves Ctrl+Alt+Z alone rather than reading it as undo', () => {
    act(() => render(<Harness onUndo={onUndo} onRedo={onRedo} />, container));
    const event = dispatchKeyDown({ key: 'z', ctrlKey: true, altKey: true });
    expect(onUndo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  // A redo chord with no handler wired should fall through to the browser
  // rather than become a key that does nothing anywhere.
  it('does not preventDefault on a redo chord it cannot handle', () => {
    act(() => render(<Harness onUndo={onUndo} onRedo={undefined} />, container));
    const event = dispatchKeyDown({ key: 'z', metaKey: true, shiftKey: true });
    expect(event.defaultPrevented).toBe(false);
  });

  it('does preventDefault on a chord it handles', () => {
    act(() => render(<Harness onUndo={onUndo} onRedo={onRedo} />, container));
    expect(dispatchKeyDown({ key: 'z', metaKey: true }).defaultPrevented).toBe(true);
    expect(dispatchKeyDown({ key: 'z', metaKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(dispatchKeyDown({ key: 'y', ctrlKey: true }).defaultPrevented).toBe(true);
  });

  it('does nothing without a modifier key', () => {
    act(() => render(<Harness onUndo={onUndo} onRedo={onRedo} />, container));
    act(() => dispatchKeyDown({ key: 'z' }));
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('a missing onRedo is safe: Shift+Cmd+Z and Ctrl+Y are simply no-ops', () => {
    act(() => render(<Harness onUndo={onUndo} onRedo={undefined} />, container));
    expect(() => act(() => dispatchKeyDown({ key: 'z', metaKey: true, shiftKey: true }))).not.toThrow();
    expect(() => act(() => dispatchKeyDown({ key: 'y', ctrlKey: true }))).not.toThrow();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('bails out while focus is in an INPUT, for both undo and redo', () => {
    const input = document.createElement('input');
    container.appendChild(input);
    input.focus();
    act(() => render(<Harness onUndo={onUndo} onRedo={onRedo} />, container));
    act(() => dispatchKeyDown({ key: 'z', metaKey: true }));
    act(() => dispatchKeyDown({ key: 'z', metaKey: true, shiftKey: true }));
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('bails out while focus is in a TEXTAREA, for both undo and redo', () => {
    const textarea = document.createElement('textarea');
    container.appendChild(textarea);
    textarea.focus();
    act(() => render(<Harness onUndo={onUndo} onRedo={onRedo} />, container));
    act(() => dispatchKeyDown({ key: 'z', metaKey: true }));
    act(() => dispatchKeyDown({ key: 'y', ctrlKey: true }));
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('removes its listener on unmount', () => {
    act(() => render(<Harness onUndo={onUndo} onRedo={onRedo} />, container));
    act(() => render(null, container));
    act(() => dispatchKeyDown({ key: 'z', metaKey: true }));
    expect(onUndo).not.toHaveBeenCalled();
  });
});
