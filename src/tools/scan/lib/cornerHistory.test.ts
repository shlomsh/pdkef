import { describe, expect, it } from 'vitest';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { MAX_CORNER_STEPS, NO_HISTORY, recorded, redone, undone, type CornerShape } from './cornerHistory.ts';

const shape = (n: number, pins: CornerShape['pins'] = null): CornerShape => ({
  quad: [{ x: n, y: 0 }, { x: n + 1, y: 0 }, { x: n + 1, y: 1 }, { x: n, y: 1 }] as Quad,
  pins,
  fine: false,
});

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object') { Object.values(v).forEach(deepFreeze); Object.freeze(v); }
  return v;
}

describe('cornerHistory', () => {
  it('undo returns the recorded shape and makes the shape it left available to redo', () => {
    const h = recorded(NO_HISTORY, shape(1));
    const u = undone(h, shape(2))!;
    expect(u.shape).toEqual(shape(1));
    expect(u.history.past).toEqual([]);
    expect(u.history.future).toEqual([shape(2)]);
  });

  it('redo returns the shape that was undone and puts the current one back on the past', () => {
    const u = undone(recorded(NO_HISTORY, shape(1)), shape(2))!;
    const r = redone(u.history, shape(1))!;
    expect(r.shape).toEqual(shape(2));
    expect(r.history.past).toEqual([shape(1)]);
    expect(r.history.future).toEqual([]);
  });

  it('a new change after an undo clears redo, so history stays linear', () => {
    const u = undone(recorded(NO_HISTORY, shape(1)), shape(2))!;
    expect(recorded(u.history, shape(1)).future).toEqual([]);
  });

  it('the cap drops the oldest step so memory stays bounded', () => {
    let h = NO_HISTORY;
    for (let i = 0; i < MAX_CORNER_STEPS + 5; i++) h = recorded(h, shape(i));
    expect(h.past).toHaveLength(MAX_CORNER_STEPS);
    expect(h.past[0]).toEqual(shape(5));
    expect(h.past.at(-1)).toEqual(shape(MAX_CORNER_STEPS + 4));
  });

  it('a change that leaves the numbers equal is still its own step', () => {
    const h = recorded(recorded(NO_HISTORY, shape(1)), shape(1));
    expect(h.past).toHaveLength(2);
  });

  it('undone and redone return null on empty stacks so callers can do nothing', () => {
    expect(undone(NO_HISTORY, shape(1))).toBeNull();
    expect(redone(NO_HISTORY, shape(1))).toBeNull();
  });

  it('no function mutates its inputs, because the history is shared state', () => {
    const pinned = shape(1, [[{ k: 0.5, at: { x: 1, y: 2 } }], [], [], []]);
    const h = deepFreeze(recorded(recorded(NO_HISTORY, pinned), shape(2)));
    const cur = deepFreeze(shape(3));
    expect(() => recorded(h, deepFreeze(shape(4)))).not.toThrow();
    const u = undone(h, cur)!;
    expect(() => redone(deepFreeze(u.history), deepFreeze(shape(9)))).not.toThrow();
    expect(() => undone(NO_HISTORY, cur)).not.toThrow();
    expect(() => recorded(NO_HISTORY, cur)).not.toThrow();
  });
});
