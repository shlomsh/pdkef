import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePressAndHold, { holdDecision, HOLD_DELAY_MS } from './usePressAndHold.ts';
import usePeekAll, { isTypingTarget } from './usePeekAll.ts';

describe('holdDecision', () => {
  it.each([
    [0, 0, 'wait'],
    [249, 0, 'wait'],
    [250, 0, 'peek'],
    [900, 3, 'peek'],
    [100, 3.1, 'cancel'],
    [300, 5, 'cancel'],
  ])('%ims, %ipx -> %s', (ms, px, want) => {
    expect(holdDecision(ms, px)).toBe(want);
  });
});

describe('usePressAndHold', () => {
  let container: HTMLElement;
  const seen: boolean[] = [];
  let start!: (e: any) => void;
  function Probe() {
    start = usePressAndHold({ onPeekChange: (on) => seen.push(on) }).onPressStart;
    return <div />;
  }
  beforeEach(() => {
    vi.useFakeTimers();
    seen.length = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<Probe />, container));
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    vi.useRealTimers();
  });

  const press = () => start({ clientX: 10, clientY: 10 });

  it('peeks after 250ms without moving and stops on release', () => {
    press();
    vi.advanceTimersByTime(HOLD_DELAY_MS);
    expect(seen).toEqual([true]);
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(seen).toEqual([true, false]);
  });

  it('does not peek when it moved 5px first, and does not swallow that move', () => {
    press();
    const later = vi.fn();
    window.addEventListener('mousemove', later);
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 15, clientY: 10, bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([]);
    document.body.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 10, bubbles: true }));
    expect(later).toHaveBeenCalled();
    window.removeEventListener('mousemove', later);
  });

  it('once peeking, moves never reach the drag gesture', () => {
    press();
    vi.advanceTimersByTime(HOLD_DELAY_MS);
    const later = vi.fn();
    window.addEventListener('mousemove', later);
    document.body.dispatchEvent(new MouseEvent('mousemove', { clientX: 90, clientY: 90, bubbles: true }));
    expect(later).not.toHaveBeenCalled();
    window.removeEventListener('mousemove', later);
    document.dispatchEvent(new MouseEvent('mouseup'));
  });
});

describe('usePeekAll', () => {
  let container: HTMLElement;
  let state = false;
  function Probe() {
    state = usePeekAll().peekAll;
    return <input data-testid="field" />;
  }
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<Probe />, container));
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  it('Space down and up toggles peekAll', () => {
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })); });
    expect(state).toBe(true);
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })); });
    expect(state).toBe(false);
  });

  it('Space inside an input does not peek', () => {
    const input = container.querySelector('input')!;
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })); });
    expect(state).toBe(false);
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(document.body)).toBe(false);
  });
});
