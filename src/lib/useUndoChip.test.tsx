// @ts-nocheck - matches the rest of the lib hook tests
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recentActions, resetActionTrailForTests } from './actionTrail.ts';
import { useUndoChip } from './useUndoChip.ts';

let chip;
function Probe() {
  chip = useUndoChip();
  return null;
}

describe('useUndoChip', () => {
  let container;

  beforeEach(() => {
    vi.useFakeTimers();
    resetActionTrailForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<Probe />, container));
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    vi.useRealTimers();
  });

  it('shows the registered message and clears itself after 5s', () => {
    act(() => chip.register('Rotated page 2', () => {}));
    expect(chip.action.message).toBe('Rotated page 2');
    act(() => vi.advanceTimersByTime(4999));
    expect(chip.action).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(chip.action).toBeNull();
  });

  it('a second registration replaces the first and restarts the window', () => {
    const first = vi.fn();
    act(() => chip.register('one', first));
    act(() => vi.advanceTimersByTime(4000));
    act(() => chip.register('two', () => {}));
    act(() => vi.advanceTimersByTime(4000));
    expect(chip.action.message).toBe('two');
    act(() => chip.run());
    expect(first).not.toHaveBeenCalled();
  });

  it('run performs the undo once, clears the chip and records the action', () => {
    const perform = vi.fn();
    act(() => chip.register('x', perform));
    act(() => chip.run());
    expect(perform).toHaveBeenCalledTimes(1);
    expect(chip.action).toBeNull();
    expect(recentActions()).toContain('undo');
    act(() => chip.run());
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('clear drops a pending chip, so a stale undo cannot run on the next document', () => {
    const perform = vi.fn();
    act(() => chip.register('x', perform));
    act(() => chip.clear());
    expect(chip.action).toBeNull();
    act(() => chip.run());
    expect(perform).not.toHaveBeenCalled();
  });

  it('leaves no timer behind after unmount', () => {
    act(() => chip.register('x', () => {}));
    act(() => render(null, container));
    expect(vi.getTimerCount()).toBe(0);
  });
});
