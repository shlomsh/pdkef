import { describe, expect, it, vi } from 'vitest';
import { DOUBLE_TAP_MS, makeArmTool, makeDoubleTap } from './toolArming.js';

/* The arming gesture both toolbars share. A plain click event is just
   `{ detail, timeStamp }` here: the rule reads nothing else. */
describe('makeArmTool', () => {
  const setup = ({ touch }) => {
    const arm = vi.fn();
    const lock = vi.fn();
    const lastTap = { tool: null, at: 0 };
    const handlerFor = (selected) => makeArmTool({ selectedTool: selected, arm, lock, lastTap, isTouch: () => touch });
    return { arm, lock, handlerFor };
  };

  it('arms on a click, and a click on the armed tool disarms it', () => {
    const { arm, lock, handlerFor } = setup({ touch: false });
    handlerFor(null)('blur')({ detail: 1, timeStamp: 0 });
    expect(arm).toHaveBeenLastCalledWith('blur');
    handlerFor('blur')('blur')({ detail: 1, timeStamp: 5000 });
    expect(arm).toHaveBeenLastCalledWith(null);
    expect(lock).not.toHaveBeenCalled();
  });

  it('locks on the second click of a mouse double-click (detail 2)', () => {
    const { lock, handlerFor } = setup({ touch: false });
    handlerFor(null)('blur')({ detail: 1, timeStamp: 0 });
    handlerFor('blur')('blur')({ detail: 2, timeStamp: 120 });
    expect(lock).toHaveBeenCalledWith('blur');
  });

  // iOS Safari reports every tap as detail 1, so the count never reaches 2.
  it('locks on a double-tap on touch, where every tap arrives as detail 1', () => {
    const { arm, lock, handlerFor } = setup({ touch: true });
    handlerFor(null)('blur')({ detail: 1, timeStamp: 1000 });
    handlerFor('blur')('blur')({ detail: 1, timeStamp: 1000 + DOUBLE_TAP_MS - 1 });
    expect(lock).toHaveBeenCalledWith('blur');
    expect(arm).toHaveBeenCalledTimes(1);
  });

  it('treats two slow taps on touch as arm, then disarm', () => {
    const { arm, lock, handlerFor } = setup({ touch: true });
    handlerFor(null)('blur')({ detail: 1, timeStamp: 1000 });
    handlerFor('blur')('blur')({ detail: 1, timeStamp: 1000 + DOUBLE_TAP_MS });
    expect(lock).not.toHaveBeenCalled();
    expect(arm).toHaveBeenLastCalledWith(null);
  });

  // Desktop keeps the OS's own double-click window; the tap rule never applies.
  it('never uses the tap window with a mouse', () => {
    const { arm, lock, handlerFor } = setup({ touch: false });
    handlerFor(null)('blur')({ detail: 1, timeStamp: 0 });
    handlerFor('blur')('blur')({ detail: 1, timeStamp: 50 });
    expect(lock).not.toHaveBeenCalled();
    expect(arm).toHaveBeenLastCalledWith(null);
  });

  it('does not lock a tool from a quick tap on a different one', () => {
    const { arm, lock, handlerFor } = setup({ touch: true });
    handlerFor(null)('blur')({ detail: 1, timeStamp: 0 });
    handlerFor('blur')('blackout')({ detail: 1, timeStamp: 100 });
    expect(lock).not.toHaveBeenCalled();
    expect(arm).toHaveBeenLastCalledWith('blackout');
  });

  // The tool disarmed itself after a placement: a quick tap now is a new arm.
  it('does not lock when the tool was disarmed by a placement in between', () => {
    const { arm, lock, handlerFor } = setup({ touch: true });
    handlerFor(null)('blur')({ detail: 1, timeStamp: 0 });
    handlerFor(null)('blur')({ detail: 1, timeStamp: 100 });
    expect(lock).not.toHaveBeenCalled();
    expect(arm).toHaveBeenLastCalledWith('blur');
  });

  // A disarming tap must not prime a lock: tap to arm, tap to disarm, and a
  // quick third tap arms again rather than locking.
  it('only a tap that armed can start a double-tap', () => {
    const { arm, lock, handlerFor } = setup({ touch: true });
    handlerFor(null)('blur')({ detail: 1, timeStamp: 0 });
    handlerFor('blur')('blur')({ detail: 1, timeStamp: 1000 });
    handlerFor(null)('blur')({ detail: 1, timeStamp: 1100 });
    expect(lock).not.toHaveBeenCalled();
    expect(arm).toHaveBeenLastCalledWith('blur');
  });
});

/* The menu tools' version (SIGN-31): no "the first tap armed it" test,
   because their first tap opens a menu. */
describe('makeDoubleTap', () => {
  const tapper = (touch) => makeDoubleTap({ key: null, at: 0 }, () => touch);

  it('reports the second of two quick taps on the same key, on touch', () => {
    const isDoubleTap = tapper(true);
    expect(isDoubleTap('shapes', { timeStamp: 1000 })).toBe(false);
    expect(isDoubleTap('shapes', { timeStamp: 1000 + DOUBLE_TAP_MS - 1 })).toBe(true);
  });

  it('ignores slow taps, taps on another key, and a mouse', () => {
    const slow = tapper(true);
    slow('shapes', { timeStamp: 0 });
    expect(slow('shapes', { timeStamp: DOUBLE_TAP_MS })).toBe(false);

    const other = tapper(true);
    other('shapes', { timeStamp: 0 });
    expect(other('signature', { timeStamp: 100 })).toBe(false);

    const mouse = tapper(false);
    mouse('shapes', { timeStamp: 0 });
    expect(mouse('shapes', { timeStamp: 100 })).toBe(false);
  });

  // Tap to open the menu, pick from it (menu closed), tap again: that tap can
  // not lock, and it is the first of a new pair rather than a spent one.
  it('a tap that cannot lock starts a new pair', () => {
    const isDoubleTap = tapper(true);
    isDoubleTap('shapes', { timeStamp: 0 });
    expect(isDoubleTap('shapes', { timeStamp: 100 }, false)).toBe(false);
    expect(isDoubleTap('shapes', { timeStamp: 200 })).toBe(true);
  });

  it('consumes the pair, so a third quick tap starts over', () => {
    const isDoubleTap = tapper(true);
    isDoubleTap('shapes', { timeStamp: 0 });
    expect(isDoubleTap('shapes', { timeStamp: 100 })).toBe(true);
    expect(isDoubleTap('shapes', { timeStamp: 200 })).toBe(false);
  });
});
