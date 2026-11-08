import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNDO_WINDOW_MS, useUndoWindow, type UndoWindow } from './useUndoWindow.ts';

let host: HTMLDivElement;
let undo: UndoWindow;

function Probe({ onExpire }: { onExpire: () => void }) {
  undo = useUndoWindow(onExpire);
  return null;
}

const mount = (onExpire: () => void) => act(() => { render(<Probe onExpire={onExpire} />, host); });

describe('useUndoWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
  });
  afterEach(() => {
    render(null, host);
    vi.useRealTimers();
  });

  it('expires once, after the window', () => {
    const onExpire = vi.fn();
    mount(onExpire);
    undo.start();
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('a second start restarts the window instead of stacking', () => {
    const onExpire = vi.fn();
    mount(onExpire);
    undo.start();
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1000);
    undo.start();
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('stop closes it without expiring', () => {
    const onExpire = vi.fn();
    mount(onExpire);
    undo.start();
    undo.stop();
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('calls the latest onExpire, and an unmount clears the timer', () => {
    const first = vi.fn();
    const second = vi.fn();
    mount(first);
    undo.start();
    mount(second);
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    undo.start();
    act(() => { render(null, host); });
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps one object across renders, so callers can list it in deps', () => {
    mount(vi.fn());
    const before = undo;
    mount(vi.fn());
    expect(undo).toBe(before);
  });
});
