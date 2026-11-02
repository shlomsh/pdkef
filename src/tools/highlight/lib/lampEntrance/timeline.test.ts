import { describe, expect, it } from 'vitest';
import { enterPlan, exitPlan, reducedPlan, toKeyframes } from './timeline.ts';

type Marks = Parameters<typeof enterPlan>[0];
type Track = ReturnType<typeof enterPlan>['tracks'][number];
// The record's lengths (fullscreen-cta round 3): in about 1.6 s, out about 1.75 s.
const ENTER_MS = 1600;
const EXIT_MS = 1750;

const marks: Marks = {
  bead: { cx: 720, cy: 272, r: 10 },
  capsule: { left: 481, top: 24, width: 477, height: 48 },
  cordTop: 252,
  viewport: { width: 1440, height: 900 },
  board: 'translate(10px, 20px) scale(0.5)',
};
const track = (tracks: Track[], part: string) => tracks.find((t) => t.part === part)!;

describe('toKeyframes', () => {
  it('turns millisecond keys into offsets and carries each key\'s easing to its segment', () => {
    const frames = toKeyframes(1000, [{ t: 0, opacity: 0, ease: 'ease-in' }, { t: 500, opacity: 1 }]);
    expect(frames).toEqual([
      { opacity: 0, offset: 0, easing: 'ease-in' },
      { opacity: 1, offset: 0.5, easing: 'linear' },
      { opacity: 1, offset: 1, easing: 'linear' },
    ]);
  });

  it('pads a first key that starts late with a copy at offset 0', () => {
    const frames = toKeyframes(100, [{ t: 50, opacity: 0.5 }, { t: 100, opacity: 1 }]);
    expect(frames[0]).toEqual({ opacity: 0.5, offset: 0, easing: 'linear' });
    expect(frames).toHaveLength(3);
  });
});

describe('enterPlan', () => {
  const plan = enterPlan(marks);

  it('runs 1.6 s', () => {
    expect(plan.duration).toBe(ENTER_MS);
  });

  it('the bead dips 14 px at 150 ms, rides to the capsule\'s centre, then opens into the pill', () => {
    const keys = track(plan.tracks, 'morph').keys;
    expect(keys.map((k) => k.t)).toEqual([0, 150, 580, 900, 1000]);
    expect(keys[1].top).toBe(`${272 + 14 - 10}px`);
    expect(keys[2]).toMatchObject({ left: `${481 + 477 / 2 - 10}px`, top: `${24 + 24 - 10}px`, width: '20px', height: '20px' });
    expect(keys[3]).toMatchObject({ left: '481px', top: '24px', width: '477px', height: '48px' });
    expect(keys[1].ease).toBe('cubic-bezier(.5, 0, .12, 1)');
  });

  it('the morph fades out as the capsule\'s content fades in, so it never covers the real capsule', () => {
    const keys = track(plan.tracks, 'morph').keys;
    expect(keys.at(-1)).toMatchObject({ t: 1000, opacity: 0, left: '481px', width: '477px' });
  });

  it('the capsule\'s content waits for the pill: invisible until 780 ms, whole by 1000 ms', () => {
    const keys = track(plan.tracks, 'capsule').keys;
    expect(keys.map((k) => [k.t, k.opacity])).toEqual([[0, 0], [780, 0], [1000, 1]]);
  });

  it('the page rises from the measured box and the cord retracts', () => {
    expect(track(plan.tracks, 'board').keys[0].transform).toBe(marks.board);
    expect(track(plan.tracks, 'board').keys.at(-1)!.transform).toBe('translate(0px, 0px) scale(1)');
    expect(track(plan.tracks, 'string').keys.map((k) => k.t)).toEqual([0, 150, 300]);
  });

  it('every track ends inside the duration', () => {
    plan.tracks.forEach((t) => expect(Math.max(...t.keys.map((k) => k.t)), t.part).toBeLessThanOrEqual(ENTER_MS));
  });

  it('with no measured page the board is left alone', () => {
    expect(enterPlan({ ...marks, board: undefined }).tracks.some((t) => t.part === 'board')).toBe(false);
  });
});

describe('exitPlan', () => {
  const plan = exitPlan({ ...marks, bead: { cx: 720, cy: 272, r: 10 } });

  it('runs 1.75 s and the bead lands at 980 ms', () => {
    expect(plan.duration).toBe(EXIT_MS);
    const morph = track(plan.tracks, 'morph').keys;
    expect(morph.find((k) => k.t === 980)).toMatchObject({ opacity: 1, left: '710px', top: '262px' });
    expect(morph.at(-1)).toMatchObject({ t: 981, opacity: 0 });
  });

  it('the cord pays out in the last 90 ms before the landing', () => {
    const line = track(plan.tracks, 'line').keys;
    expect(line.map((k) => [k.t, k.transform])).toEqual([[0, 'scaleY(0)'], [890, 'scaleY(0)'], [980, 'scaleY(1)']]);
  });

  it('the landing dips 3 px and the cord swings -6, 4, -1.8 degrees and rests', () => {
    const dip = track(plan.tracks, 'cord').keys.find((k) => k.t === 980 + 90)!;
    expect(dip.transform).toBe('translateY(3px)');
    const swing = track(plan.tracks, 'settle').keys.map((k) => k.transform);
    expect(swing).toEqual(['rotate(0deg)', 'rotate(0deg)', 'rotate(-6deg)', 'rotate(4deg)', 'rotate(-1.8deg)', 'rotate(0deg)']);
  });

  it('the page shrinks back from the lamp box and the site slides down 36 px into view', () => {
    expect(track(plan.tracks, 'board').keys[0].transform).toBe(marks.board);
    const site = track(plan.tracks, 'site').keys;
    expect(site[0]).toMatchObject({ opacity: 0, transform: 'translateY(-36px)' });
    expect(site.at(-1)).toMatchObject({ opacity: 1, transform: 'translateY(0px)' });
  });

  it('every track ends inside the duration', () => {
    plan.tracks.forEach((t) => expect(Math.max(...t.keys.map((k) => k.t)), t.part).toBeLessThanOrEqual(EXIT_MS));
  });
});

describe('reducedPlan', () => {
  it('is a crossfade of the capsule going in and the site coming back', () => {
    expect(reducedPlan('enter').tracks.map((t) => t.part)).toEqual(['capsule']);
    expect(reducedPlan('exit').tracks.map((t) => t.part)).toEqual(['site']);
    expect(reducedPlan('enter').duration).toBeLessThan(400);
  });
});
