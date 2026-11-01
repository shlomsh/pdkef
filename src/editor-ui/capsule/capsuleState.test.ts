import { describe, it, expect } from 'vitest';
import { capsuleReducer, initialCapsule, DOZE_SCROLL_PX, type CapsuleEvent, type CapsuleState } from './capsuleState.ts';

const run = (events: CapsuleEvent[], from: CapsuleState = initialCapsule) => events.reduce(capsuleReducer, from);
const awake = (over: Partial<CapsuleState> = {}): CapsuleState => ({ ...initialCapsule, mode: 'awake', ...over });

describe('capsuleReducer', () => {
  it('starts dozing with nothing held', () => {
    expect(initialCapsule).toEqual({ mode: 'dozing', hovered: false, focused: false, menuOpen: false, scrolledSinceWake: 0 });
  });

  it.each<[string, CapsuleEvent]>([
    ['pointerEnter', { type: 'pointerEnter' }],
    ['focusIn', { type: 'focusIn' }],
    ['menuOpen', { type: 'menuOpen' }],
  ])('%s wakes it', (_, e) => {
    expect(capsuleReducer(initialCapsule, e).mode).toBe('awake');
  });

  it('leaving does not doze it', () => {
    expect(run([{ type: 'pointerEnter' }, { type: 'pointerLeave' }]).mode).toBe('awake');
    expect(run([{ type: 'focusIn' }, { type: 'focusOut' }]).mode).toBe('awake');
    expect(run([{ type: 'menuOpen' }, { type: 'menuClose' }]).mode).toBe('awake');
  });

  it('a scroll of 24 or less does not doze it', () => {
    expect(run([{ type: 'scroll', dy: DOZE_SCROLL_PX }], awake()).mode).toBe('awake');
    expect(run([{ type: 'scroll', dy: -DOZE_SCROLL_PX }], awake()).mode).toBe('awake');
  });

  it('a 10 followed by a 15 dozes it', () => {
    expect(run([{ type: 'scroll', dy: 10 }, { type: 'scroll', dy: -15 }], awake()).mode).toBe('dozing');
  });

  it('a page press dozes it', () => {
    expect(run([{ type: 'pagePress' }], awake()).mode).toBe('dozing');
  });

  it.each<[string, Partial<CapsuleState>]>([
    ['hovered', { hovered: true }],
    ['focused', { focused: true }],
    ['a menu open', { menuOpen: true }],
  ])('nothing dozes it while %s', (_, held) => {
    const s = awake(held);
    expect(run([{ type: 'pagePress' }], s).mode).toBe('awake');
    expect(run([{ type: 'scroll', dy: 100 }], s).mode).toBe('awake');
  });

  it('waking resets the scroll sum', () => {
    const s = run([{ type: 'scroll', dy: 20 }], awake());
    expect(s.scrolledSinceWake).toBe(20);
    expect(run([{ type: 'pointerEnter' }], s).scrolledSinceWake).toBe(0);
    expect(run([{ type: 'focusIn' }], s).scrolledSinceWake).toBe(0);
    expect(run([{ type: 'menuOpen' }], s).scrolledSinceWake).toBe(0);
  });

  it('a dozing capsule keeps no scroll sum', () => {
    expect(run([{ type: 'scroll', dy: 500 }]).scrolledSinceWake).toBe(0);
  });
});
