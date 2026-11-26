import { describe, expect, it } from 'vitest';
import type { Sides } from './edges/follow.ts';
import { NO_TRACE, shownSides, traceReducer } from './cornerTrace.ts';

type TraceStateOf = Parameters<typeof traceReducer>[0];
const side = Array.from({ length: 15 }, (_, i) => ({ x: 0.3 + i * 0.01, y: 0.5 }));
const SIDES = [side, side, side, side] as Sides;

describe('traceReducer', () => {
  it('drops an answer for an older quad that arrives after the quad changed', () => {
    let state = traceReducer(NO_TRACE, { type: 'asked', seq: 1 });
    state = traceReducer(state, { type: 'asked', seq: 2 });
    state = traceReducer(state, { type: 'answered', seq: 1, id: 1, key: 'old', sides: SIDES });
    expect(state.traced).toBeNull();
    expect(shownSides(state, 1, 'old', true)).toBeNull();
  });

  it('lands the answer for the request still wanted', () => {
    let state = traceReducer(NO_TRACE, { type: 'asked', seq: 1 });
    state = traceReducer(state, { type: 'answered', seq: 1, id: 1, key: 'k', sides: SIDES });
    expect(shownSides(state, 1, 'k', true)).toBe(SIDES);
  });

  it('passes no trace when the answer is null', () => {
    const state = traceReducer({ current: 1, traced: null }, { type: 'answered', seq: 1, id: 1, key: 'k', sides: null });
    expect(shownSides(state, 1, 'k', true)).toBeNull();
  });

  it('keeps the last answer when a later one fails', () => {
    const had: TraceStateOf = { current: 2, traced: { id: 1, key: 'k', sides: SIDES } };
    expect(traceReducer(had, { type: 'answered', seq: 2, id: 1, key: 'k2', sides: null })).toBe(had);
  });

  it('drops an answer once Fine-tune edges is off', () => {
    let state = traceReducer(NO_TRACE, { type: 'asked', seq: 1 });
    state = traceReducer(state, { type: 'cancelled' });
    state = traceReducer(state, { type: 'answered', seq: 1, id: 1, key: 'k', sides: SIDES });
    expect(state.traced).toBeNull();
  });
});

describe('shownSides', () => {
  const state: TraceStateOf = { current: 1, traced: { id: 1, key: 'k', sides: SIDES } };

  it('shows the sides for the page and the quad-and-pins key they were computed for', () => {
    expect(shownSides(state, 1, 'k', true)).toBe(SIDES);
  });

  it('shows no outline for the previous pins, because a pin set is its own trace', () => {
    expect(shownSides(state, 1, 'k-with-a-pin', true)).toBeNull();
  });

  it('shows none for another page, or with Fine-tune edges off', () => {
    expect(shownSides(state, 2, 'k', true)).toBeNull();
    expect(shownSides(state, 1, 'k', false)).toBeNull();
  });
});
