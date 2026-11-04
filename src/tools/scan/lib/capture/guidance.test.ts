import { describe, expect, it } from 'vitest';
import { BENT_SHARE, DEFAULT_GUIDANCE_PARAMS, INITIAL_GUIDANCE, looksBent, stepGuidance, type Guidance, type Hint } from './guidance.ts';
import { DEFAULT_CAPTURE_PARAMS, type CapturePhase, type FrameObservation } from './types.ts';
import type { Quad } from '../quad.ts';

const P = DEFAULT_GUIDANCE_PARAMS;
const HASH = '0123456789abcdef';
/** A page well inside the frame, 0.42 of it. */
const Q: Quad = [{ x: 0.2, y: 0.15 }, { x: 0.8, y: 0.15 }, { x: 0.8, y: 0.85 }, { x: 0.2, y: 0.85 }];
/** The same page with its bottom-right corner on the frame's edge. */
const CUT: Quad = [{ x: 0.2, y: 0.15 }, { x: 0.8, y: 0.15 }, { x: 1, y: 1 }, { x: 0.2, y: 0.85 }];

/** A good page: found, sharp, big enough, standing out, seen from above. */
const page = (t: number, over: Partial<FrameObservation> = {}): FrameObservation => ({
  t, quad: Q, confidence: 1, sharpness: 500, area: 0.42, hash: HASH, focus: 10, contrast: 0.7, keystone: 0.95, light: 0.15, ...over,
});
const none = (t: number, over: Partial<FrameObservation> = {}): FrameObservation => ({
  t, quad: null, confidence: 0, sharpness: 0, area: 0, hash: HASH, focus: 0, light: 0.15, ...over,
});

/** The camera's pace on an iPhone (SCAN-04): a frame every 80 ms. */
const FRAME = 80;

/** Frames from `from` for `ms`, each made by `make`, all in `phase`. */
function frames(from: number, ms: number, make: (t: number) => FrameObservation, phase: CapturePhase = 'locked') {
  const out: [FrameObservation, CapturePhase][] = [];
  for (let t = from; t < from + ms; t += FRAME) out.push([make(t), phase]);
  return out;
}

/** Runs the frames and returns the guidance after each. */
function run(seq: [FrameObservation, CapturePhase][], start: Guidance = INITIAL_GUIDANCE): Guidance[] {
  const out: Guidance[] = [];
  let g = start;
  for (const [obs, phase] of seq) {
    g = stepGuidance(g, obs, phase);
    out.push(g);
  }
  return out;
}
const last = <T>(xs: T[]) => xs[xs.length - 1];
/** The first hint a fresh guidance shows for this frame: the first frame shows what it wants at once. */
const first = (obs: FrameObservation, phase: CapturePhase = 'locked'): Hint => stepGuidance(INITIAL_GUIDANCE, obs, phase).hint;

describe('stepGuidance: each condition', () => {
  it('no page: point', () => {
    expect(first(none(0), 'searching')).toBe('point');
  });

  it('a good page, locked or holding: hold', () => {
    expect(first(page(0), 'locked')).toBe('hold');
    expect(first(page(0), 'holding')).toBe('hold');
  });

  it('moving: a blurred page says hold, even when the blur costs it confidence', () => {
    expect(first(page(0, { sharpness: 20 }), 'searching')).toBe('hold');
    expect(first(page(0, { sharpness: 20, confidence: 0.4 }), 'searching')).toBe('hold');
  });

  it('a page just taken: turn', () => {
    expect(first(page(0), 'waitingForChange')).toBe('turn');
  });

  it('a page taken already (SCAN-23): duplicate', () => {
    expect(first(page(0), 'duplicate')).toBe('duplicate');
  });

  it('a corner on the frame edge: fit', () => {
    expect(first(page(0, { quad: CUT }), 'searching')).toBe('fit');
    expect(first(page(0, { quad: CUT.map((p) => ({ x: Math.min(p.x, 0.995), y: Math.min(p.y, 0.995) })) as Quad }), 'searching')).toBe('fit');
  });

  it('a page lost just after touching the edge (too close to be found): still fit, then point', () => {
    const seq = run([...frames(0, 400, (t) => page(t, { quad: CUT }), 'searching'), ...frames(400, 3000, (t) => none(t), 'searching')]);
    const at = (t: number) => seq[Math.round(t / FRAME)].wanted;
    expect(at(400 + P.edgeMemoryMs - 2 * FRAME)).toBe('fit');
    expect(at(400 + P.edgeMemoryMs + 2 * FRAME)).toBe('point');
    expect(last(seq).hint).toBe('point');
  });

  it('a page under minArea: closer', () => {
    expect(first(page(0, { area: 0.15 }), 'searching')).toBe('closer');
  });

  it('a page whose border barely stands out: contrast', () => {
    expect(first(page(0, { contrast: 0.15 }), 'locked')).toBe('contrast');
  });

  it('no page found against a light view: contrast; against a dark one: point', () => {
    expect(first(none(0, { light: 0.8 }), 'searching')).toBe('contrast');
    expect(first(none(0, { light: 0.3 }), 'searching')).toBe('point');
  });

  it('a page seen steeply: flatter', () => {
    expect(first(page(0, { keystone: 0.5 }), 'holding')).toBe('flatter');
  });

  it('something found that is not like a page, sharp: point', () => {
    expect(first(page(0, { confidence: 0.4 }), 'searching')).toBe('point');
  });

  it('observations without the guidance signals get the plain hints', () => {
    const plain = page(0);
    delete plain.contrast;
    delete plain.keystone;
    delete plain.light;
    expect(first(plain, 'locked')).toBe('hold');
    expect(first({ ...none(0), light: undefined }, 'searching')).toBe('point');
  });
});

describe('stepGuidance: priority', () => {
  it('turn over everything', () => {
    expect(first(page(0, { quad: CUT, area: 0.1, contrast: 0.1, keystone: 0.3, sharpness: 10 }), 'waitingForChange')).toBe('turn');
  });

  it('duplicate over framing', () => {
    expect(first(page(0, { quad: CUT, area: 0.1 }), 'duplicate')).toBe('duplicate');
  });

  it('fit over closer, closer over contrast, contrast over flatter, flatter over hold', () => {
    const all = { quad: CUT, area: 0.1, contrast: 0.1, keystone: 0.3, sharpness: 10 };
    expect(first(page(0, all), 'searching')).toBe('fit');
    expect(first(page(0, { ...all, quad: Q }), 'searching')).toBe('closer');
    expect(first(page(0, { ...all, quad: Q, area: 0.42 }), 'searching')).toBe('contrast');
    expect(first(page(0, { ...all, quad: Q, area: 0.42, contrast: 0.7 }), 'searching')).toBe('flatter');
    expect(first(page(0, { ...all, quad: Q, area: 0.42, contrast: 0.7, keystone: 0.95 }), 'searching')).toBe('hold');
  });
});

describe('stepGuidance: steady', () => {
  it('a hint stays at least minShowMs, and the next shows once wanted for settleMs', () => {
    const seq = run([...frames(0, 2 * FRAME, (t) => page(t)), ...frames(2 * FRAME, 2000, (t) => page(t, { keystone: 0.5 }))]);
    seq.forEach((g, i) => {
      const t = i * FRAME;
      if (t < P.minShowMs) expect(g.hint).toBe('hold');
    });
    const shownAt = seq.findIndex((g) => g.hint === 'flatter') * FRAME;
    expect(shownAt).toBeGreaterThanOrEqual(P.minShowMs);
    expect(shownAt).toBeLessThan(P.minShowMs + 2 * FRAME);
  });

  it('a frame or two of something else never changes the line, however long the hint has shown', () => {
    const seq = run([
      ...frames(0, 3000, (t) => page(t)),
      ...frames(3000, 2 * FRAME, (t) => none(t), 'searching'),
      ...frames(3000 + 2 * FRAME, 1000, (t) => page(t)),
    ]);
    expect(seq.every((g) => g.hint === 'hold')).toBe(true);
  });

  it('a want that keeps switching never shows', () => {
    const seq = run([
      ...frames(0, 1500, (t) => page(t)),
      ...frames(1500, 3000, (t) => (Math.floor(t / 240) % 2 ? page(t, { keystone: 0.5 }) : page(t, { area: 0.1 }))),
    ]);
    expect(seq.every((g) => g.hint === 'hold')).toBe(true);
  });

  it('turn cuts in at once, then holds its minimum like any other', () => {
    const seq = run([
      ...frames(0, 200, (t) => page(t), 'holding'),
      ...frames(200, 2 * FRAME, (t) => page(t), 'waitingForChange'),
      ...frames(200 + 2 * FRAME, 2000, (t) => none(t), 'searching'),
    ]);
    const turnAt = seq.findIndex((g) => g.hint === 'turn');
    expect(turnAt * FRAME).toBeLessThanOrEqual(200 + FRAME);
    const pointAt = seq.findIndex((g) => g.hint === 'point');
    expect((pointAt - turnAt) * FRAME).toBeGreaterThanOrEqual(P.minShowMs);
  });
});

describe('stepGuidance: hysteresis', () => {
  /** The readings after a run of single frames in one guidance. */
  const readings = (obs: FrameObservation[]) => obs.reduce((g, o) => stepGuidance(g, o, 'locked'), INITIAL_GUIDANCE).readings;

  it('steep from under keystoneEnter, cleared only at keystoneLeave', () => {
    expect(readings([page(0, { keystone: 0.65 })]).steep).toBe(false);
    expect(readings([page(0, { keystone: 0.58 }), page(80, { keystone: 0.65 })]).steep).toBe(true);
    expect(readings([page(0, { keystone: 0.58 }), page(80, { keystone: 0.72 })]).steep).toBe(false);
  });

  it('small from under minArea, cleared only at areaLeave times it', () => {
    const { minArea } = DEFAULT_CAPTURE_PARAMS;
    expect(readings([page(0, { area: minArea + 0.01 })]).small).toBe(false);
    expect(readings([page(0, { area: minArea - 0.01 }), page(80, { area: minArea + 0.01 })]).small).toBe(true);
    expect(readings([page(0, { area: minArea - 0.01 }), page(80, { area: minArea * P.areaLeave })]).small).toBe(false);
  });

  it('faint from under contrastEnter, cleared only at contrastLeave', () => {
    expect(readings([page(0, { contrast: 0.27 })]).faint).toBe(false);
    expect(readings([page(0, { contrast: 0.2 }), page(80, { contrast: 0.27 })]).faint).toBe(true);
    expect(readings([page(0, { contrast: 0.2 }), page(80, { contrast: 0.31 })]).faint).toBe(false);
  });

  it('on the edge within edgeEnter, cleared only past edgeLeave', () => {
    const near = (m: number): Quad => [{ x: m, y: 0.15 }, { x: 0.8, y: 0.15 }, { x: 0.8, y: 0.85 }, { x: m, y: 0.85 }];
    expect(readings([page(0, { quad: near(0.015) })]).edge).toBe(false);
    expect(readings([page(0, { quad: near(0.005) }), page(80, { quad: near(0.015) })]).edge).toBe(true);
    expect(readings([page(0, { quad: near(0.005) }), page(80, { quad: near(0.03) })]).edge).toBe(false);
  });

  it('a light view from lightEnter, cleared only under lightLeave', () => {
    const light = (obs: FrameObservation[]) => obs.reduce((g, o) => stepGuidance(g, o, 'searching'), INITIAL_GUIDANCE).readings.light;
    expect(light([none(0, { light: 0.58 })])).toBe(false);
    expect(light([none(0, { light: 0.62 }), none(80, { light: 0.58 })])).toBe(true);
    expect(light([none(0, { light: 0.62 }), none(80, { light: 0.5 })])).toBe(false);
  });

  it('a page lost for a frame keeps its readings: steep is still steep when it comes back in between', () => {
    expect(readings([page(0, { keystone: 0.55 }), none(80), page(160, { keystone: 0.65 })]).steep).toBe(true);
  });
});

describe('stepGuidance: what screen readers hear', () => {
  it('the first hint at once, a change only speakGapMs after the last, and turn always at once', () => {
    const seq = run([
      ...frames(0, 1400, (t) => none(t), 'searching'),
      ...frames(1400, 2000, (t) => page(t), 'holding'),
      ...frames(3400, 2 * FRAME, (t) => page(t), 'waitingForChange'),
    ]);
    expect(seq[0].spoken).toBe('point');
    const holdShown = seq.findIndex((g) => g.hint === 'hold');
    expect(seq[holdShown].spoken).toBe('point');
    const holdSpoken = seq.findIndex((g) => g.spoken === 'hold');
    expect(holdSpoken * FRAME).toBeGreaterThanOrEqual(P.speakGapMs);
    const turn = seq.findIndex((g) => g.hint === 'turn');
    expect(seq[turn].spoken).toBe('turn');
  });

  it('a hint that came and went inside the gap is never spoken', () => {
    const seq = run([
      ...frames(0, 1300, (t) => page(t)),
      ...frames(1300, 1300, (t) => page(t, { keystone: 0.5 })),
      ...frames(2600, 3000, (t) => page(t)),
    ]);
    expect(seq.some((g) => g.hint === 'flatter')).toBe(true);
    expect(seq.every((g) => g.spoken === 'hold')).toBe(true);
  });
});

describe('looksBent', () => {
  it('is false without a measured bend (before SCAN-21) or without a page', () => {
    expect(looksBent({ width: 1700, height: 2400 })).toBe(false);
    expect(looksBent(undefined)).toBe(false);
    expect(looksBent({ width: 1700, height: 2400, bentPx: 0 })).toBe(false);
  });

  it('is true past BENT_SHARE of the long edge: about 19 px at 2400', () => {
    expect(BENT_SHARE * 2400).toBeCloseTo(19.2);
    expect(looksBent({ width: 1700, height: 2400, bentPx: 12 })).toBe(false);
    expect(looksBent({ width: 1700, height: 2400, bentPx: 19 })).toBe(false);
    expect(looksBent({ width: 1700, height: 2400, bentPx: 20 })).toBe(true);
    expect(looksBent({ width: 2400, height: 1700, bentPx: 40 })).toBe(true);
  });

  it('scales with the page: the same share on a smaller output', () => {
    expect(looksBent({ width: 850, height: 1200, bentPx: 10 })).toBe(true);
    expect(looksBent({ width: 850, height: 1200, bentPx: 9 })).toBe(false);
  });
});
