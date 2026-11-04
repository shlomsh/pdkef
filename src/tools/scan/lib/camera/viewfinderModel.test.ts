import { describe, expect, it } from 'vitest';
import { coverRect, hintText, liveView, nextView, toFrame, visibleShare } from './viewfinderModel.ts';
import { INITIAL_GUIDANCE } from '../capture/guidance.ts';
import { IDLE_VIEW } from './types.ts';
import { DEFAULT_CAPTURE_PARAMS, type CaptureState } from '../capture/types.ts';
import type { Quad } from '#lib/pageEnhance/quad.ts';

const Q: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];

const state = (over: Partial<CaptureState>): CaptureState => ({
  phase: 'searching', smoothed: null, holdSince: null, lastCaptureHash: null, lastT: null, prevQuad: null, lostSince: null, focusAnchor: null, settledSince: null,
  ...over,
});

describe('liveView', () => {
  it('searching: dashed outline, point', () => {
    expect(liveView(state({ smoothed: Q }), 100)).toMatchObject({ quad: Q, locked: false, hold: 0, hint: 'point', spoken: null });
    expect(liveView(state({}), 100).quad).toBeNull();
  });

  it('locked: solid, hold', () => {
    expect(liveView(state({ phase: 'locked', smoothed: Q }), 100)).toMatchObject({ quad: Q, locked: true, hold: 0, hint: 'hold', spoken: null });
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
    expect(v).toMatchObject({ quad: Q, locked: false, hold: 0, hint: 'turn', spoken: null });
  });

  it('the guidance, when given, says the hint and what is spoken; the outline still follows the phase', () => {
    const guidance = { ...INITIAL_GUIDANCE, hint: 'flatter' as const, spoken: 'hold' as const };
    const v = liveView(state({ phase: 'holding', smoothed: Q, holdSince: 1000 }), 1300, DEFAULT_CAPTURE_PARAMS, guidance);
    expect(v.hint).toBe('flatter');
    expect(v.spoken).toBe('hold');
    expect(v.locked).toBe(true);
    expect(v.guidance).toBe(guidance);
    expect(liveView(state({ smoothed: Q }), 100, DEFAULT_CAPTURE_PARAMS, { ...INITIAL_GUIDANCE, hint: 'contrast' }).locked).toBe(false);
  });

  it('nextView steps the guidance on from the previous view', () => {
    const obs = (t: number, keystone: number) => ({ t, quad: Q, confidence: 1, sharpness: 500, area: 0.5, hash: '0', focus: 1, contrast: 0.7, keystone });
    const first = nextView(IDLE_VIEW, state({ phase: 'locked', smoothed: Q }), obs(0, 0.95));
    expect(first.hint).toBe('hold');
    expect(first.spoken).toBe('hold');
    let v = first;
    for (let t = 80; t <= 2000; t += 80) v = nextView(v, state({ phase: 'holding', smoothed: Q, holdSince: 0 }), obs(t, 0.4));
    expect(v.hint).toBe('flatter');
    expect(v.locked).toBe(true);
  });
});

describe('hintText', () => {
  const words = {
    hintPoint: 'Point', hintHold: 'Hold still', hintTurn: 'Page {count}. Turn the page.',
    hintDuplicate: 'Taken', hintFit: 'Fit', hintCloser: 'Closer', hintContrast: 'Darker', hintFlatter: 'Flatter',
  };
  it('picks the words, filling the count for turn', () => {
    expect(hintText('point', 2, words)).toBe('Point');
    expect(hintText('hold', 2, words)).toBe('Hold still');
    expect(hintText('turn', 3, words)).toBe('Page 3. Turn the page.');
  });

  it('has words for every guidance hint', () => {
    expect(['duplicate', 'fit', 'closer', 'contrast', 'flatter'].map((h) => hintText(h as Parameters<typeof hintText>[0], 1, words)))
      .toEqual(['Taken', 'Fit', 'Closer', 'Darker', 'Flatter']);
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

describe('visibleShare', () => {
  const box = { width: 63, height: 100 };
  it('a 4:3 portrait video in a narrower box loses the sides', () => {
    const v = visibleShare({ width: 480, height: 640 }, box);
    expect(v.y).toBe(0);
    expect(v.height).toBe(1);
    expect(v.width).toBeCloseTo(0.63 / 0.75);
    expect(v.x).toBeCloseTo((1 - v.width) / 2);
  });
  it('a 4:3 landscape video shows about 0.47 of its width', () => {
    const v = visibleShare({ width: 640, height: 480 }, box);
    expect(v.width).toBeCloseTo(0.63 / (4 / 3));
    expect(v.height).toBe(1);
  });
  it('a 16:9 video shows less still', () => {
    expect(visibleShare({ width: 1920, height: 1080 }, box).width).toBeCloseTo(0.63 / (16 / 9));
  });
  it('a box the shape of the video shows the whole frame', () => {
    expect(visibleShare({ width: 480, height: 640 }, { width: 120, height: 160 })).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
  it('a box taller than the video crops the top and bottom', () => {
    const v = visibleShare({ width: 640, height: 480 }, { width: 100, height: 50 });
    expect(v.x).toBe(0);
    expect(v.width).toBe(1);
    expect(v.height).toBeCloseTo(1.3333 / 2, 3);
  });
  it('zero sizes give the whole frame', () => {
    const whole = { x: 0, y: 0, width: 1, height: 1 };
    expect(visibleShare({ width: 0, height: 0 }, box)).toEqual(whole);
    expect(visibleShare({ width: 640, height: 480 }, { width: 0, height: 0 })).toEqual(whole);
  });
});

describe('toFrame', () => {
  it('a view corner lands on the screen corner under coverRect', () => {
    const video = { width: 640, height: 480 };
    const box = { width: 390, height: 844 };
    const cover = coverRect(video, box);
    const view = visibleShare(video, box);
    const q = toFrame([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], view);
    const corners = [[0, 0], [box.width, 0], [box.width, box.height], [0, box.height]];
    q.forEach((p, i) => {
      expect(cover.x + p.x * cover.width).toBeCloseTo(corners[i][0]);
      expect(cover.y + p.y * cover.height).toBeCloseTo(corners[i][1]);
    });
  });
  it('the whole view maps to itself', () => {
    expect(toFrame(Q, { x: 0, y: 0, width: 1, height: 1 })).toEqual(Q);
  });
});

describe('nextView with a crop', () => {
  it('returns the outline across the whole frame', () => {
    const view = { x: 0.25, y: 0, width: 0.5, height: 1 };
    const obs = (t: number, keystone: number) => ({ t, quad: Q, confidence: 1, sharpness: 500, area: 0.5, hash: '0', focus: 1, contrast: 0.7, keystone });
    const v = nextView(IDLE_VIEW, state({ phase: 'locked', smoothed: Q }), obs(0, 0.95), view);
    expect(v.quad![0].x).toBeCloseTo(0.25 + 0.1 * 0.5);
    expect(v.quad![2].x).toBeCloseTo(0.25 + 0.9 * 0.5);
    expect(v.quad![0].y).toBeCloseTo(0.1);
  });
});
