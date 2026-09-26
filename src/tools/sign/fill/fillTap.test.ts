import { describe, expect, it } from 'vitest';
import { fillTapDecision, fillToolOf, type FillTapInput } from './fillTap.ts';
import type { PagePoint, ReachTarget } from './fillTypes.ts';

const point = (x: number, y: number): PagePoint => ({ pageIndex: 0, x, y });

const reachOf = (kind: ReachTarget['kind'], key = 'k'): ReachTarget => (
  { kind, key, pageIndex: 0, box: { left: 10, top: 10, width: 20, height: 10 } }
);

const base: FillTapInput = {
  onFillInput: false,
  onElementBar: false,
  onElement: false,
  elementFillKey: null,
  onMark: false,
  typing: false,
  tool: 'other',
  reach: null,
  at: null,
};

describe('fillTapDecision', () => {
  it('lets a fill input take native focus, above every other rule', () => {
    const input: FillTapInput = {
      onFillInput: true,
      onElementBar: false,
      onElement: false,
      elementFillKey: null,
      onMark: false,
      typing: true,
      tool: 'text',
      reach: reachOf('box'),
      at: point(1, 1),
    };
    expect(fillTapDecision(input)).toEqual({ type: 'native' });
  });

  it('focuses a fill target when Text is armed and it is in reach', () => {
    const input: FillTapInput = { ...base, tool: 'text', reach: reachOf('fill', 'slot-1') };
    expect(fillTapDecision(input)).toEqual({ type: 'focus', key: 'slot-1' });
  });

  it('focuses the fill target even while a typing session is open', () => {
    const input: FillTapInput = { ...base, tool: 'text', reach: reachOf('fill', 'slot-2'), typing: true };
    expect(fillTapDecision(input)).toEqual({ type: 'focus', key: 'slot-2' });
  });

  it('delegates to an empty slot\'s centre when Date is armed and it is in reach, even while typing', () => {
    const input: FillTapInput = { ...base, tool: 'date', reach: reachOf('fill', 'slot-3'), typing: true };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate', at: { pageIndex: 0, x: 20, y: 15 } });
  });

  it('never opens a free slot for Date: nothing in reach is production\'s own placement, and the fallback carries no point', () => {
    const input: FillTapInput = { ...base, tool: 'date', at: point(3, 4) };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate' });
  });

  it('delegates to a tick box centre when Mark is armed and it is in reach', () => {
    const input: FillTapInput = { ...base, tool: 'mark', reach: reachOf('box', 'box-1') };
    // box left 10, top 10, width 20, height 10 -> centre (20, 15).
    expect(fillTapDecision(input)).toEqual({ type: 'delegate', at: { pageIndex: 0, x: 20, y: 15 } });
  });

  it('delegates to the box centre even while a typing session is open', () => {
    const input: FillTapInput = { ...base, tool: 'mark', reach: reachOf('box', 'box-1'), typing: true };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate', at: { pageIndex: 0, x: 20, y: 15 } });
  });

  it('does not focus a reach target of the wrong kind for Text', () => {
    const input: FillTapInput = { ...base, tool: 'text', reach: reachOf('box') };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate' });
  });

  it('does not delegate-at-centre for a reach target of the wrong kind for Mark', () => {
    const input: FillTapInput = { ...base, tool: 'mark', reach: reachOf('fill') };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate' });
  });

  it('falls through a mismatched reach target to dismiss a typing session', () => {
    const input: FillTapInput = { ...base, tool: 'text', reach: reachOf('box'), typing: true };
    expect(fillTapDecision(input)).toEqual({ type: 'dismiss' });
  });

  it('dismisses a typing session when the tap is away from everything', () => {
    const input: FillTapInput = { ...base, typing: true };
    expect(fillTapDecision(input)).toEqual({ type: 'dismiss' });
  });

  it('opens a free slot when Text is armed, not typing, and nothing is in reach', () => {
    const input: FillTapInput = { ...base, tool: 'text', at: point(3, 4) };
    expect(fillTapDecision(input)).toEqual({ type: 'freeSlot', at: point(3, 4) });
  });

  it('does not open a free slot for Text with no page point', () => {
    const input: FillTapInput = { ...base, tool: 'text' };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate' });
  });

  it('delegates to production with no point when nothing else matches: only a corrected point ever carries `at`', () => {
    const input: FillTapInput = { ...base, tool: 'mark', at: point(7, 8) };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate' });
  });

  it('delegates to production with no point when there is none', () => {
    expect(fillTapDecision(base)).toEqual({ type: 'delegate' });
  });

  it("focuses a fill target when nothing is armed ('none') and it is in reach, same as Text", () => {
    const input: FillTapInput = { ...base, tool: 'none', reach: reachOf('fill', 'slot-4') };
    expect(fillTapDecision(input)).toEqual({ type: 'focus', key: 'slot-4' });
  });

  it("delegates a tick box as the symbol tool when nothing is armed ('none')", () => {
    const input: FillTapInput = { ...base, tool: 'none', reach: reachOf('box', 'box-2') };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate', at: { pageIndex: 0, x: 20, y: 15 }, tool: 'symbol' });
  });

  it("opens a free slot when nothing is armed ('none'), not typing, and nothing is in reach", () => {
    const input: FillTapInput = { ...base, tool: 'none', at: point(3, 4) };
    expect(fillTapDecision(input)).toEqual({ type: 'freeSlot', at: point(3, 4) });
  });

  it("does not delegate as the symbol tool for a tick box when Text is explicitly armed", () => {
    const input: FillTapInput = { ...base, tool: 'text', reach: reachOf('box', 'box-3') };
    const decision = fillTapDecision(input);
    expect(decision).toEqual({ type: 'delegate' });
    expect((decision as { tool?: string }).tool).toBeUndefined();
  });

  it('an element that is not a mark, tapped outside the box, wins over a box reach, nothing armed', () => {
    const input: FillTapInput = {
      ...base, onElement: true, onMark: false, tool: 'none', reach: reachOf('box', 'box-4'), at: point(90, 90),
    };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate' });
  });

  it('an element that is not a mark, tapped outside the box, wins over a box reach, Mark armed', () => {
    const input: FillTapInput = {
      ...base, onElement: true, onMark: false, tool: 'mark', reach: reachOf('box', 'box-5'), at: point(90, 90),
    };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate' });
  });

  it('a box reach wins over a tap that landed on a mark, nothing armed', () => {
    const input: FillTapInput = { ...base, onElement: true, onMark: true, tool: 'none', reach: reachOf('box', 'box-4') };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate', at: { pageIndex: 0, x: 20, y: 15 }, tool: 'symbol' });
  });

  it('a box reach wins over a tap that landed on a mark, Mark armed', () => {
    const input: FillTapInput = { ...base, onElement: true, onMark: true, tool: 'mark', reach: reachOf('box', 'box-5') };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate', at: { pageIndex: 0, x: 20, y: 15 } });
  });

  it('a box reach wins when the tap point itself lands inside the box, not a mark, nothing armed', () => {
    // Box is left 10, top 10, width 20, height 10; (15, 12) is inside it.
    const input: FillTapInput = {
      ...base, onElement: true, onMark: false, tool: 'none', reach: reachOf('box', 'box-4'), at: point(15, 12),
    };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate', at: { pageIndex: 0, x: 20, y: 15 }, tool: 'symbol' });
  });

  it('a box reach wins when the tap point itself lands inside the box, not a mark, Mark armed', () => {
    const input: FillTapInput = {
      ...base, onElement: true, onMark: false, tool: 'mark', reach: reachOf('box', 'box-5'), at: point(15, 12),
    };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate', at: { pageIndex: 0, x: 20, y: 15 } });
  });

  it('a tap on an existing element still beats a fill reach: the element wins over a text field', () => {
    const input: FillTapInput = { ...base, onElement: true, tool: 'none', reach: reachOf('fill', 'slot-5') };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate' });
  });

  it('a tap on an existing element with nothing else in reach is production\'s own plain path', () => {
    const input: FillTapInput = { ...base, onElement: true, tool: 'none' };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate' });
  });

  it('a tap on a filled element\'s edge focuses its own input instead of selecting it', () => {
    const input: FillTapInput = { ...base, onElement: true, elementFillKey: 'el:e1', tool: 'none' };
    expect(fillTapDecision(input)).toEqual({ type: 'focus', key: 'el:e1' });
  });

  it('the same overhang tap with no fill key on the element still delegates, unaffected', () => {
    const input: FillTapInput = { ...base, onElement: true, elementFillKey: null, tool: 'none' };
    expect(fillTapDecision(input)).toEqual({ type: 'delegate' });
  });

  it('a tap on the element\'s actions bar is unaffected by elementFillKey', () => {
    const input: FillTapInput = { ...base, onElementBar: true, elementFillKey: 'el:e1', tool: 'none' };
    expect(fillTapDecision(input)).toEqual({ type: 'element' });
  });

  it('an element\'s options bar wins over a box reach, nothing armed', () => {
    const input: FillTapInput = { ...base, onElementBar: true, tool: 'none', reach: reachOf('box', 'box-6') };
    expect(fillTapDecision(input)).toEqual({ type: 'element' });
  });

  it('an element\'s options bar wins over a box reach, Mark armed', () => {
    const input: FillTapInput = { ...base, onElementBar: true, tool: 'mark', reach: reachOf('box', 'box-7') };
    expect(fillTapDecision(input)).toEqual({ type: 'element' });
  });

  it('an element\'s options bar wins even over a fill input tap', () => {
    // onFillInput still wins above it - the bar only matters once that rule has fallen
    // through - but the bar must never fall through to the box-first rule below it.
    const input: FillTapInput = { ...base, onElementBar: true, onFillInput: true, tool: 'text' };
    expect(fillTapDecision(input)).toEqual({ type: 'native' });
  });

  it('sets finishTyping on a box toggle (nothing armed) while a typing session is open', () => {
    const input: FillTapInput = { ...base, tool: 'none', reach: reachOf('box', 'box-8'), typing: true };
    expect(fillTapDecision(input)).toEqual({
      type: 'delegate',
      at: { pageIndex: 0, x: 20, y: 15 },
      tool: 'symbol',
      finishTyping: true,
    });
  });

  it('does not set finishTyping on a box toggle (nothing armed) when not typing', () => {
    const input: FillTapInput = { ...base, tool: 'none', reach: reachOf('box', 'box-9'), typing: false };
    const decision = fillTapDecision(input);
    expect(decision).toEqual({ type: 'delegate', at: { pageIndex: 0, x: 20, y: 15 }, tool: 'symbol' });
    expect((decision as { finishTyping?: boolean }).finishTyping).toBeUndefined();
  });
});

describe('fillToolOf', () => {
  it('maps no tool to \'none\', and Text stays its own tool', () => {
    expect(fillToolOf(null)).toBe('none');
    expect(fillToolOf('text')).toBe('text');
  });

  it('maps Date and the symbol tool to their own fill tools', () => {
    expect(fillToolOf('date')).toBe('date');
    expect(fillToolOf('symbol')).toBe('mark');
  });

  it('leaves every other tool to production', () => {
    expect(fillToolOf('signature')).toBe('other');
    expect(fillToolOf('rectangle')).toBe('other');
    expect(fillToolOf('whiteout')).toBe('other');
  });
});
