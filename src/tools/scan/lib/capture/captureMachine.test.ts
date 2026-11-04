import { describe, expect, it } from 'vitest';
import type { Quad } from '../quad.ts';
import { INITIAL_CAPTURE_STATE, markTaken, searchAgain, stepCapture, TAKEN_MEMORY } from './captureMachine.ts';
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
const HASH_C = '00ff00ff00ff00ff';
/** HASH_A with three bits flipped: the same page, another frame. */
const HASH_A_NOISY = '0f0f0f0f0f0f0f08';
const page = (t: number, over: Partial<FrameObservation> = {}): FrameObservation => ({
  t, quad: pageQuad(), confidence: 0.9, sharpness: 500, area: 0.64, hash: HASH_A, focus: 1000, ...over,
});
const none = (t: number): FrameObservation => ({ t, quad: null, confidence: 0, sharpness: 0, area: 0, hash: HASH_A, focus: 0 });

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
    expect(fired[0]).toBeGreaterThanOrEqual(800);
    expect(fired[0]).toBeLessThan(800 + 2 * FRAME);
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
  it('does not take a page removed for over a second and put back again (SCAN-23)', () => {
    const frames = [...seq(0, 1500, (t) => page(t)), ...seq(1500, 1200, none), ...seq(2700, 3000, (t) => page(t))];
    const { fired, state } = run(frames);
    expect(fired).toHaveLength(1);
    expect(state.phase).toBe('duplicate');
  });
  it('takes a different page put back after a removal', () => {
    const frames = [...seq(0, 1500, (t) => page(t)), ...seq(1500, 1200, none), ...seq(2700, 1500, (t) => page(t, { hash: HASH_B }))];
    expect(run(frames).fired).toHaveLength(2);
  });
  it('does not re-arm on a short dropout of the same page', () => {
    const frames = [...seq(0, 1500, (t) => page(t)), ...seq(1500, 200, none), ...seq(1700, 2000, (t) => page(t))];
    expect(run(frames).fired).toHaveLength(1);
  });
  it('resets the hold when frames go missing mid-hold', () => {
    const frames = [...seq(0, 400, (t) => page(t)), ...seq(433, 100, none), ...seq(600, 450, (t) => page(t))];
    const { fired } = run(frames);
    expect(fired.length === 0 || fired[0] >= 600 + 800).toBe(true);
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

describe('focus settling', () => {
  // each frame improves on the last by more than the 25% a settleRatio of 0.8 tolerates
  const rising = (t: number, i: number) => page(t, { focus: 100 * 1.3 ** i });
  const top = 100 * 1.3 ** Math.floor(2000 / FRAME);
  it('flat focus fires at holdMs', () => {
    const { fired } = run(seq(0, 1500, (t) => page(t, { focus: 800 })));
    expect(fired).toHaveLength(1);
    expect(fired[0]).toBeGreaterThanOrEqual(800);
    expect(fired[0]).toBeLessThan(800 + 2 * FRAME);
  });
  it('a blank page (flat, low focus) still fires', () => {
    expect(run(seq(0, 1500, (t) => page(t, { focus: 3 }))).fired).toHaveLength(1);
  });
  it('focus still rising does not fire, then fires once it settles', () => {
    const frames = [...seq(0, 2000, rising), ...seq(2033, 1000, (t) => page(t, { focus: top }))];
    const { fired } = run(frames);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toBeGreaterThanOrEqual(1980 + 400);
    expect(fired[0]).toBeLessThan(1980 + 400 + 2 * FRAME);
  });
  it('rising focus alone never fires', () => {
    expect(run(seq(0, 2000, rising)).fired).toEqual([]);
  });
  it('a slow climb does not fire while it climbs', () => {
    // 5% a frame is inside what one frame may improve, but not across a whole settle window
    expect(run(seq(0, 2000, (t, i) => page(t, { focus: 100 * 1.05 ** i }))).fired).toEqual([]);
  });
  it('one bright frame does not hold the shot back: focus settling lower still fires', () => {
    const steady = (t: number) => page(t, { focus: 1000 });
    const { fired } = run([...seq(0, 300, steady), page(333, { focus: 3000 }), ...seq(366, 1500, steady)]);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toBeGreaterThanOrEqual(366 + 400);
  });
  it('a drop restarts the settle', () => {
    const frames = [...seq(0, 700, (t) => page(t, { focus: 1000 })), page(733, { focus: 500 }), ...seq(766, 1000, (t) => page(t, { focus: 1000 }))];
    const { fired } = run(frames);
    expect(fired).toHaveLength(1);
    // the drop is below 0.8 of the anchor, so the settle restarts at 733 and fires no sooner than 400 ms later
    expect(fired[0]).toBeGreaterThanOrEqual(733 + 400);
  });
  it('holds (does not fire) while waiting, the phase stays holding', () => {
    const { state, fired } = run(seq(0, 1000, rising));
    expect(fired).toEqual([]);
    expect(state.phase).toBe('holding');
    expect(state.focusAnchor).not.toBeNull();
  });
  it.each([
    ['blur', page(500, { sharpness: 5 })],
    ['jitter', page(500, { quad: pageQuad(0.03) })],
    ['jump', page(500, { quad: pageQuad(0.1, 0.1, 0.7) })],
    ['no page', none(500)],
    ['dropped frame', page(900)],
  ])('leaving the hold (%s) resets focusAnchor and settledSince', (_name, frame) => {
    const held = run(seq(0, 400, (t) => page(t))).state;
    expect(held.focusAnchor).not.toBeNull();
    const out = stepCapture(held, frame).state;
    expect(out.focusAnchor).toBeNull();
    expect(out.settledSince).toBeNull();
  });
  it('firing and markTaken reset them', () => {
    const { state } = run(seq(0, 1000, (t) => page(t)));
    expect(state.phase).toBe('waitingForChange');
    expect(state.focusAnchor).toBeNull();
    expect(state.settledSince).toBeNull();
    const held = run(seq(0, 400, (t) => page(t))).state;
    const taken = markTaken(held, HASH_A);
    expect(taken.focusAnchor).toBeNull();
    expect(taken.settledSince).toBeNull();
  });
});

describe('markTaken', () => {
  it('waits for a change after a shot by hand, and keeps smoothed', () => {
    const held = run(seq(0, 300, (t) => page(t))).state;
    const state = markTaken(held, HASH_A);
    expect(state.phase).toBe('waitingForChange');
    expect(state.lastCaptureHash).toBe(HASH_A);
    expect(state.holdSince).toBeNull();
    expect(state.lostSince).toBeNull();
    expect(state.smoothed).toEqual(held.smoothed);
  });
  it('does not fire again on the same page', () => {
    const state = markTaken(INITIAL_CAPTURE_STATE, HASH_A);
    expect(run(seq(0, 3000, (t) => page(t)), state).fired).toEqual([]);
  });
  it('re-arms on a different page', () => {
    const state = markTaken(INITIAL_CAPTURE_STATE, HASH_A);
    expect(run(seq(0, 1500, (t) => page(t, { hash: HASH_B })), state).fired).toHaveLength(1);
  });
});

describe('one page, one shot (SCAN-23)', () => {
  const away = (from: number) => seq(from, 1200, none);
  it('remembers every page taken, not only the last', () => {
    const frames = [
      ...seq(0, 1500, (t) => page(t)), ...away(1500),
      ...seq(2700, 1500, (t) => page(t, { hash: HASH_B })), ...away(4200),
      ...seq(5400, 3000, (t) => page(t, { hash: HASH_A_NOISY })),
    ];
    const { fired, state } = run(frames);
    expect(fired).toHaveLength(2);
    expect(state.phase).toBe('duplicate');
    expect(state.takenHashes).toEqual([HASH_A, HASH_B]);
  });
  it('an earlier page shown right after a shot, without leaving, is a duplicate', () => {
    const frames = [...seq(0, 1500, (t) => page(t, { hash: HASH_B })), ...seq(1500, 3000, (t) => page(t, { hash: HASH_A }))];
    const start = markTaken(INITIAL_CAPTURE_STATE, HASH_A);
    const { fired, state } = run(frames, start);
    expect(fired).toHaveLength(1);
    expect(state.phase).toBe('duplicate');
  });
  it('a duplicate never fires, held still for 10 s', () => {
    const start = searchAgain(markTaken(INITIAL_CAPTURE_STATE, HASH_A));
    const { fired, state } = run(seq(0, 10000, (t) => page(t)), start);
    expect(fired).toEqual([]);
    expect(state.phase).toBe('duplicate');
    expect(state.holdSince).toBeNull();
  });
  it('is reported from the first frame the page is in view, and follows its corners', () => {
    const start = searchAgain(markTaken(INITIAL_CAPTURE_STATE, HASH_A));
    const step = stepCapture(start, page(0));
    expect(step.capture).toBeNull();
    expect(step.state.phase).toBe('duplicate');
    expect(step.state.smoothed).toEqual(pageQuad());
  });
  it('a duplicate stays duplicate through a short dropout', () => {
    const start = searchAgain(markTaken(INITIAL_CAPTURE_STATE, HASH_A));
    const { state } = run([...seq(0, 300, (t) => page(t)), ...seq(333, 200, none)], start);
    expect(state.phase).toBe('duplicate');
  });
  it('a duplicate gone for leaveMs goes back to searching, still remembering it', () => {
    const start = searchAgain(markTaken(INITIAL_CAPTURE_STATE, HASH_A));
    const { state } = run([...seq(0, 300, (t) => page(t)), ...seq(333, 900, none)], start);
    expect(state.phase).toBe('searching');
    expect(state.takenHashes).toEqual([HASH_A]);
  });
  it('a duplicate turned to a new page is taken once', () => {
    const start = searchAgain(markTaken(INITIAL_CAPTURE_STATE, HASH_A));
    const { fired } = run([...seq(0, 1000, (t) => page(t)), ...seq(1023, 3000, (t) => page(t, { hash: HASH_C }))], start);
    expect(fired).toHaveLength(1);
    // the hold counts from the last duplicate frame, as it counts from a locked one
    expect(fired[0]).toBeGreaterThanOrEqual(1023 - FRAME + 800);
  });
  it('a duplicate frame mid-hold stops the hold, the phase says duplicate', () => {
    const start = searchAgain(markTaken(INITIAL_CAPTURE_STATE, HASH_A));
    const held = run(seq(0, 500, (t) => page(t, { hash: HASH_B })), start).state;
    expect(held.phase).toBe('holding');
    const step = stepCapture(held, page(533));
    expect(step.capture).toBeNull();
    expect(step.state.phase).toBe('duplicate');
    expect(step.state.holdSince).toBeNull();
  });
  it('remembers at most TAKEN_MEMORY pages, dropping the oldest', () => {
    let state = INITIAL_CAPTURE_STATE;
    for (let i = 0; i < TAKEN_MEMORY + 5; i += 1) state = markTaken(state, i.toString(16).padStart(16, '0'));
    expect(state.takenHashes).toHaveLength(TAKEN_MEMORY);
    expect(state.takenHashes![0]).toBe((5).toString(16).padStart(16, '0'));
  });
  it('searchAgain keeps the pages taken and starts the rest afresh', () => {
    const taken = run(seq(0, 1500, (t) => page(t))).state;
    const again = searchAgain(taken);
    expect(again).toEqual({ ...INITIAL_CAPTURE_STATE, lastCaptureHash: HASH_A, takenHashes: [HASH_A] });
  });
  it('a fire while auto is off or paused waits for a change but remembers nothing', () => {
    let state = INITIAL_CAPTURE_STATE;
    let fired = 0;
    for (const f of seq(0, 1500, (t) => page(t))) {
      const step = stepCapture(state, f, undefined, false);
      state = step.state;
      if (step.capture) fired += 1;
    }
    expect(fired).toBe(1);
    expect(state.phase).toBe('waitingForChange');
    expect(state.takenHashes).toEqual([]);
  });
  it('the shutter still takes a page already taken, and remembers it once', () => {
    const dup = run(seq(0, 300, (t) => page(t)), searchAgain(markTaken(INITIAL_CAPTURE_STATE, HASH_A))).state;
    expect(dup.phase).toBe('duplicate');
    const state = markTaken(dup, HASH_A);
    expect(state.phase).toBe('waitingForChange');
    expect(state.takenHashes).toEqual([HASH_A]);
  });
});
