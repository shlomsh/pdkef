import { describe, expect, it } from 'vitest';
import { SLOP_PX, TAP_MAX_DURATION_MS } from './constants.ts';
import {
  createGestureMachine,
  type GestureEffect,
  type GestureEvent,
  type PointerKind,
  type Under,
} from './gestureMachine.ts';

const BLANK: Under = { kind: 'blank', armedCreate: false };
const CREATE_BLANK: Under = { kind: 'blank', armedCreate: true };
const SELECTED: Under = { kind: 'element', wasSelected: true };
const UNSELECTED: Under = { kind: 'element', wasSelected: false };

const sample = (pointerId: number, pointerType: PointerKind, x: number, y: number, t: number) => ({
  pointerId,
  pointerType,
  x,
  y,
  t,
});
const down = (
  id: number,
  type: PointerKind,
  x: number,
  y: number,
  t: number,
  under: Under,
): GestureEvent => ({
  type: 'down',
  under,
  ...sample(id, type, x, y, t),
});
const move = (id: number, type: PointerKind, x: number, y: number, t: number): GestureEvent => ({
  type: 'move',
  ...sample(id, type, x, y, t),
});
const up = (id: number, type: PointerKind, x: number, y: number, t: number): GestureEvent => ({
  type: 'up',
  ...sample(id, type, x, y, t),
});

/** Feed a synthetic stream, return every effect in order plus the machine. */
function run(events: GestureEvent[]) {
  const effects: GestureEffect[] = [];
  const machine = createGestureMachine((effect) => effects.push(effect));
  for (const event of events) machine.send(event);
  return { effects, machine };
}
const types = (effects: GestureEffect[]) => effects.map((effect) => effect.type);
const MOVING = ['begin', 'update', 'commit'];

describe('gesture machine (SNG-04, guidelines §2)', () => {
  it('2026-09-25 staggered fingers: finger 1 down on a selected element, finger 2 down, finger 1 up with no move commits nothing', () => {
    const { effects, machine } = run([
      down(1, 'touch', 100, 100, 0, SELECTED),
      down(2, 'touch', 200, 100, 30, BLANK),
      up(1, 'touch', 100, 100, 60),
    ]);
    // Finger 1 lifting is no tap and no commit: the pair was a pinch.
    expect(types(effects)).toEqual(['pinch-start', 'pinch-end']);
    expect(machine.state.kind).toBe('scroll');
  });

  it('the same race after the drag has already begun cancels it, and releasing finger 1 commits nothing', () => {
    const { effects } = run([
      down(1, 'touch', 100, 100, 0, SELECTED),
      move(1, 'touch', 120, 100, 20),
      down(2, 'touch', 200, 100, 40, BLANK),
      up(1, 'touch', 120, 100, 60),
    ]);
    expect(types(effects)).toContain('cancel');
    expect(types(effects)).not.toContain('commit');
  });

  it('create path: a second finger cancels create, and nothing commits', () => {
    const { effects } = run([
      down(1, 'touch', 50, 50, 0, CREATE_BLANK),
      move(1, 'touch', 80, 80, 20),
      down(2, 'touch', 200, 50, 40, BLANK),
      up(1, 'touch', 80, 80, 60),
      up(2, 'touch', 200, 50, 80),
    ]);
    expect(
      effects.filter((e) => e.type === 'begin').map((e) => (e as { gesture: string }).gesture),
    ).toEqual(['create']);
    expect(types(effects)).toContain('cancel');
    expect(types(effects)).not.toContain('commit');
  });

  it('a swipe on an unselected element scrolls and never drags', () => {
    const { effects, machine } = run([
      down(1, 'touch', 100, 100, 0, UNSELECTED),
      move(1, 'touch', 100, 140, 20),
      move(1, 'touch', 100, 200, 40),
    ]);
    expect(machine.state.kind).toBe('scroll');
    expect(effects).toEqual([]);
    machine.send(up(1, 'touch', 100, 200, 60));
    expect(machine.state.kind).toBe('idle');
    expect(effects).toEqual([]);
  });

  it('a tap on an unselected element selects it', () => {
    const { effects, machine } = run([
      down(1, 'touch', 100, 100, 0, UNSELECTED),
      up(1, 'touch', 100, 100, 80),
    ]);
    expect(effects).toEqual([{ type: 'tap', under: UNSELECTED, x: 100, y: 100 }]);
    expect(machine.state.kind).toBe('idle');
  });

  it('a touch held past the tap limit is not a tap', () => {
    const { effects } = run([
      down(1, 'touch', 100, 100, 0, UNSELECTED),
      up(1, 'touch', 100, 100, TAP_MAX_DURATION_MS + 1),
    ]);
    expect(effects).toEqual([]);
  });

  it('a selected element does not follow the finger until the slop, then it does', () => {
    const { effects, machine } = run([
      down(1, 'touch', 100, 100, 0, SELECTED),
      move(1, 'touch', 100 + SLOP_PX - 1, 100, 20),
    ]);
    expect(effects).toEqual([]);
    expect(machine.state.kind).toBe('pending');
    machine.send(move(1, 'touch', 100 + SLOP_PX, 100, 40));
    expect(machine.state.kind).toBe('drag');
    expect(types(effects)).toEqual(['begin', 'update']);
    machine.send(move(1, 'touch', 130, 100, 60));
    expect(effects.at(-1)).toEqual({
      type: 'update',
      gesture: 'drag',
      origin: { x: 100, y: 100 },
      at: { x: 130, y: 100 },
    });
    machine.send(up(1, 'touch', 130, 100, 80));
    expect(effects.at(-1)).toEqual({ type: 'commit', gesture: 'drag' });
  });

  it('a pinch excludes a drag: no drag effects after the second finger lands', () => {
    const { effects, machine } = run([
      down(1, 'touch', 100, 100, 0, SELECTED),
      move(1, 'touch', 130, 100, 20),
      down(2, 'touch', 200, 100, 40, BLANK),
    ]);
    expect(machine.state.kind).toBe('pinch');
    const afterPinch = effects.length;
    machine.send(move(1, 'touch', 150, 100, 60));
    machine.send(move(2, 'touch', 250, 100, 70));
    const later = effects.slice(afterPinch);
    expect(types(later)).toEqual(['pinch-update', 'pinch-update']);
  });

  it('the finger left after a pinch only scrolls, it never starts a drag', () => {
    const { effects, machine } = run([
      down(1, 'touch', 100, 100, 0, SELECTED),
      down(2, 'touch', 200, 100, 20, BLANK),
      up(1, 'touch', 100, 100, 40),
      move(2, 'touch', 260, 100, 60),
    ]);
    expect(machine.state.kind).toBe('scroll');
    expect(types(effects).filter((type) => MOVING.includes(type))).toEqual([]);
  });

  it('mouse: drag starts on the first pixel with no slop, selecting an unselected element in the same gesture', () => {
    const { effects, machine } = run([
      down(1, 'mouse', 100, 100, 0, UNSELECTED),
      move(1, 'mouse', 101, 100, 10),
    ]);
    expect(machine.state.kind).toBe('drag');
    expect(types(effects)).toEqual(['select', 'begin', 'update']);
    machine.send(up(1, 'mouse', 101, 100, 20));
    expect(effects.at(-1)).toEqual({ type: 'commit', gesture: 'drag' });
  });

  it('mouse: a click is a tap, and a touch finger arriving mid mouse-drag is ignored', () => {
    const click = run([down(1, 'mouse', 5, 5, 0, UNSELECTED), up(1, 'mouse', 5, 5, 900)]);
    expect(click.effects).toEqual([{ type: 'tap', under: UNSELECTED, x: 5, y: 5 }]);
    const mixed = run([
      down(1, 'mouse', 100, 100, 0, SELECTED),
      move(1, 'mouse', 110, 100, 10),
      down(2, 'touch', 200, 100, 20, BLANK),
    ]);
    expect(mixed.machine.state.kind).toBe('drag');
  });
});
