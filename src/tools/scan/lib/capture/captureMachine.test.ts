import { describe, expect, it } from 'vitest';
import type { Quad } from '../quad.ts';
import { INITIAL_CAPTURE_STATE, stepCapture } from './captureMachine.ts';
import type { CaptureState, FrameObservation } from './types.ts';

const FRAME = 33;
const pageQuad = (dx = 0, dy = 0, s = 0.8): Quad => {
  const o = (1 - s) / 2;
  return [
    { x: o + dx, y: o + dy }, { x: o + s + dx, y: o + dy },
    { x: o + s + dx, y: o + s + dy }, { x: o + dx, y: o + s + dy },
  ];
};
const HASH_A = '0f0f0f0f0f0f0f0f';
const HASH_B = 'f0f0f0f0f0f0f0f0';
const page = (t: number, over: Partial<FrameObservation> = {}): FrameObservation => ({
  t, quad: pageQuad(), confidence: 0.9, sharpness: 500, area: 0.64, hash: HASH_A, ...over,
});
const none = (t: number): FrameObservation => ({ t, quad: null, confidence: 0, sharpness: 0, area: 0, hash: HASH_A });

/** Runs frames through the machine; returns the times at which a capture fired. */
function run(frames: FrameObservation[], start: CaptureState = INITIAL_CAPTURE_STATE) {
  let state = start;
  const fired: number[] = [];
  for (const f of frames) {
    const step = stepCapture(state, f);
    state = step.state;
    if (step.capture) fired.push(f.t);
  }
  return { state, fired };
}
const seq = (from: number, ms: number, make: (t: number, i: number) => FrameObservation) =>
  Array.from({ length: Math.floor(ms / FRAME) + 1 }, (_, i) => make(from + i * FRAME, i));

describe('stepCapture', () => {
  it('fires exactly once on a steady page, once the hold has lasted holdMs', () => {
    const { fired, state } = run(seq(0, 1500, (t) => page(t)));
    expect(fired).toHaveLength(1);
    expect(fired[0]).toBeGreaterThanOrEqual(600);
    expect(fired[0]).toBeLessThan(600 + 2 * FRAME);
    expect(state.phase).toBe('waitingForChange');
    expect(state.lastCaptureHash).toBe(HASH_A);
  });
  it('hands back the smoothed quad on the firing frame', () => {
    let state = INITIAL_CAPTURE_STATE;
    let got: Quad | null = null;
    for (const f of seq(0, 1000, (t) => page(t))) {
      const step = stepCapture(state, f);
      state = step.state;
      if (step.capture) got = step.capture;
    }
    expect(got).not.toBeNull();
    expect(got![0].x).toBeCloseTo(pageQuad()[0].x, 3);
  });
  it('never fires on a jittery page', () => {
    const { fired } = run(seq(0, 5000, (t, i) => page(t, { quad: pageQuad(i % 2 ? 0.03 : 0) })));
    expect(fired).toEqual([]);
  });
  it('never fires on a blurry page', () => {
    expect(run(seq(0, 5000, (t) => page(t, { sharpness: 10 }))).fired).toEqual([]);
  });
  it('never fires on a small page', () => {
    expect(run(seq(0, 5000, (t) => page(t, { area: 0.1, quad: pageQuad(0, 0, 0.32) }))).fired).toEqual([]);
  });
  it('never fires on a low-confidence page', () => {
    expect(run(seq(0, 5000, (t) => page(t, { confidence: 0.2 }))).fired).toEqual([]);
  });
  it('takes the same page held still for 10 s once', () => {
    expect(run(seq(0, 10000, (t) => page(t))).fired).toHaveLength(1);
  });
  it('takes a swapped page (new hash) again', () => {
    const frames = [...seq(0, 1500, (t) => page(t)), ...seq(1500, 2000, (t) => page(t, { hash: HASH_B }))];
    expect(run(frames).fired).toHaveLength(2);
  });
  it('takes a page removed and put back again', () => {
    const frames = [...seq(0, 1500, (t) => page(t)), ...seq(1500, 1200, none), ...seq(2700, 1500, (t) => page(t))];
    expect(run(frames).fired).toHaveLength(2);
  });
  it('does not re-arm on a short dropout of the same page', () => {
    const frames = [...seq(0, 1500, (t) => page(t)), ...seq(1500, 200, none), ...seq(1700, 2000, (t) => page(t))];
    expect(run(frames).fired).toHaveLength(1);
  });
  it('resets the hold when frames go missing mid-hold', () => {
    const frames = [...seq(0, 400, (t) => page(t)), ...seq(433, 100, none), ...seq(600, 450, (t) => page(t))];
    const { fired } = run(frames);
    expect(fired.length === 0 || fired[0] >= 600 + 600).toBe(true);
  });
  it('treats a gap in t as an interrupted hold', () => {
    const frames = [...seq(0, 400, (t) => page(t)), page(1000), page(1033)];
    expect(run(frames).fired).toEqual([]);
  });
  it('a blurry frame mid-hold restarts the hold', () => {
    const frames = [...seq(0, 400, (t) => page(t)), page(433, { sharpness: 5 }), ...seq(466, 300, (t) => page(t))];
    expect(run(frames).fired).toEqual([]);
  });
  it('a big jump of the corners restarts the hold', () => {
    const frames = [...seq(0, 400, (t) => page(t)), ...seq(433, 400, (t) => page(t, { quad: pageQuad(0.1, 0.1, 0.7) }))];
    expect(run(frames).fired).toEqual([]);
  });
  it('locks on a good page before holding', () => {
    expect(stepCapture(INITIAL_CAPTURE_STATE, page(0)).state.phase).toBe('locked');
  });
});
