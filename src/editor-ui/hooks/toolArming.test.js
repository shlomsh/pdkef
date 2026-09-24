import { describe, expect, it, vi } from 'vitest';
import { DOUBLE_TAP_MS, makeArmTool } from './toolArming.js';

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
