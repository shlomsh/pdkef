import { describe, expect, it } from 'vitest';
import { coverRect, hintText, liveView } from './viewfinderModel.ts';
import { DEFAULT_CAPTURE_PARAMS, type CaptureState } from '../capture/types.ts';
import type { Quad } from '../quad.ts';

const Q: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];

const state = (over: Partial<CaptureState>): CaptureState => ({
  phase: 'searching', smoothed: null, holdSince: null, lastCaptureHash: null, lastT: null, prevQuad: null, lostSince: null, focusAnchor: null, settledSince: null,
  ...over,
});

describe('liveView', () => {
  it('searching: dashed outline, point', () => {
    expect(liveView(state({ smoothed: Q }), 100)).toEqual({ quad: Q, locked: false, hold: 0, hint: 'point' });
    expect(liveView(state({}), 100).quad).toBeNull();
  });

  it('locked: solid, hold', () => {
    expect(liveView(state({ phase: 'locked', smoothed: Q }), 100)).toEqual({ quad: Q, locked: true, hold: 0, hint: 'hold' });
  });

  it('holding: the ring fills with time', () => {
    const v = liveView(state({ phase: 'holding', smoothed: Q, holdSince: 1000 }), 1300);
    expect(v.locked).toBe(true);
    expect(v.hint).toBe('hold');
    expect(v.hold).toBeCloseTo(300 / DEFAULT_CAPTURE_PARAMS.holdMs);
  });

  it('holding: clamps to 0 and 1, and uses the given params', () => {
    const s = state({ phase: 'holding', smoothed: Q, holdSince: 1000 });
    expect(liveView(s, 900).hold).toBe(0);
    expect(liveView(s, 5000).hold).toBeLessThan(1);
    expect(liveView(s, 1100, { ...DEFAULT_CAPTURE_PARAMS, holdMs: 200 }).hold).toBe(0.5);
  });

  it('holding without holdSince: ring empty', () => {
    expect(liveView(state({ phase: 'holding', smoothed: Q }), 100).hold).toBe(0);
  });

  it('waitingForChange: not locked, turn, no ring', () => {
    const v = liveView(state({ phase: 'waitingForChange', smoothed: Q, holdSince: 1000 }), 1300);
    expect(v).toEqual({ quad: Q, locked: false, hold: 0, hint: 'turn' });
  });
});

describe('hintText', () => {
  const words = { hintPoint: 'Point', hintHold: 'Hold still', hintTurn: 'Page {count}. Turn the page.' };
  it('picks the words, filling the count for turn', () => {
    expect(hintText('point', 2, words)).toBe('Point');
    expect(hintText('hold', 2, words)).toBe('Hold still');
    expect(hintText('turn', 3, words)).toBe('Page 3. Turn the page.');
  });
});

describe('coverRect', () => {
  it('fills the box exactly when the aspect matches', () => {
    expect(coverRect({ width: 400, height: 300 }, { width: 200, height: 150 })).toEqual({ x: 0, y: 0, width: 200, height: 150 });
  });

  it('a portrait video in a landscape box overflows vertically, centred', () => {
    expect(coverRect({ width: 300, height: 400 }, { width: 600, height: 300 })).toEqual({ x: 0, y: -250, width: 600, height: 800 });
  });

  it('a landscape video in a portrait box overflows sideways, centred', () => {
    expect(coverRect({ width: 400, height: 300 }, { width: 150, height: 300 })).toEqual({ x: -125, y: 0, width: 400, height: 300 });
  });

  it('an unplayed video (0 size) takes the whole box', () => {
    expect(coverRect({ width: 0, height: 0 }, { width: 200, height: 100 })).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(coverRect({ width: 100, height: 0 }, { width: 200, height: 100 })).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });
});
