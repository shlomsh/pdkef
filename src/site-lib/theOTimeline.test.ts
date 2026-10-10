import { describe, expect, it } from 'vitest';
import { PACE, theOTimeline, theOTimelineCss } from './theOTimeline.ts';

const timeline = theOTimeline();
const SCREEN = 100;

describe('theOTimeline', () => {
  it('lights all six cards in order', () => {
    expect(timeline.lit).toHaveLength(6);
    timeline.lit.slice(1).forEach((svh, i) => expect(svh).toBeGreaterThan(timeline.lit[i]));
  });

  it('rests on every card for at least a screen and a half before the next change', () => {
    const changes = [timeline.wipes[2][0], timeline.wipes[3][0], timeline.wipes[4][0], timeline.wipes[5][0], timeline.takeoff];
    changes.forEach((change, i) => expect(change - timeline.lit[i]).toBeGreaterThanOrEqual(SCREEN * 1.5));
  });

  it('lights a card only once its change has finished', () => {
    expect(timeline.lit[1]).toBeGreaterThan(timeline.wipes[2][1]);
    expect(timeline.lit[2]).toBeGreaterThan(timeline.wipes[3][1]);
    expect(timeline.lit[3]).toBeGreaterThan(timeline.intoO[1]);
    expect(timeline.lit[4]).toBeGreaterThan(timeline.intoWindow[1]);
  });

  it('gives every change into a card at least a screen of scrolling', () => {
    Object.values(timeline.wipes).forEach(([start, end]) => expect(end - start).toBeGreaterThanOrEqual(SCREEN));
    expect(timeline.intoO[1] - timeline.intoO[0]).toBeGreaterThanOrEqual(SCREEN);
    expect(timeline.intoWindow[1] - timeline.intoWindow[0]).toBeGreaterThanOrEqual(SCREEN);
  });

  it('keeps the O as it is until the night card has opened around it', () => {
    expect(timeline.intoWindow[0]).toBeGreaterThanOrEqual(timeline.wipes[5][1]);
  });

  it('raises the shade as the window finishes, and lights its words while it rises', () => {
    expect(timeline.shade[0]).toBeGreaterThan(timeline.intoWindow[0]);
    expect(timeline.shade[0]).toBeLessThan(timeline.intoWindow[1]);
    expect(timeline.shade[1] - timeline.shade[0]).toBeGreaterThanOrEqual(SCREEN);
    expect(timeline.lit[4]).toBeGreaterThan(timeline.shade[0]);
    expect(timeline.lit[4]).toBeLessThan(timeline.shade[1]);
  });

  it('switches airplane mode on while the window rests, before take-off', () => {
    expect(timeline.toggle[0]).toBeGreaterThan(timeline.shade[1]);
    expect(timeline.toggle[1]).toBeLessThan(timeline.takeoff);
  });

  it('swaps the plane for paper at the middle of the roll', () => {
    expect(timeline.swap).toBeGreaterThan(timeline.roll[0]);
    expect(timeline.swap).toBeLessThan(timeline.roll[1]);
  });

  it('shows the last sentence a screen before the plane lands on it, then rests', () => {
    expect(timeline.waypoints.land - timeline.lit[5]).toBeGreaterThanOrEqual(SCREEN);
    expect(timeline.total - timeline.waypoints.land).toBe(PACE.landed);
  });
});

describe('theOTimelineCss', () => {
  const css = theOTimelineCss(timeline);
  const percentages = [...css.matchAll(/(-?[\d.]+)%/g)].map((match) => Number(match[1]));

  it('sets the pin to the timeline length', () => {
    expect(css).toContain(`height: calc(${timeline.total}svh + 100svh`);
  });

  it('writes every moment as a percentage of the pin', () => {
    expect(percentages.length).toBeGreaterThan(30);
    percentages.forEach((value) => expect(value).toBeGreaterThanOrEqual(0));
    percentages.forEach((value) => expect(value).toBeLessThanOrEqual(100));
  });

  it('names a range at both ends of every animation range', () => {
    const ranges = [...css.matchAll(/animation-range: ([^;]+);/g)].flatMap((match) => match[1].split(','));
    expect(ranges.length).toBeGreaterThan(8);
    ranges.forEach((range) => expect(range.trim()).toMatch(/^contain [\d.]+% contain [\d.]+%$/));
  });

  it('changes the O into the window frame and raises the shade on the timeline', () => {
    expect(css).toContain('@keyframes o-frame');
    expect(css).toMatch(/\.o-shade \{ animation-range: contain [\d.]+% contain [\d.]+%; \}/);
  });

  it('cues each card and the landing', () => {
    for (let n = 1; n <= 6; n++) expect(css).toContain(`--o-lit: ${n}; }`);
    expect(css).toContain('--o-landed: 1; }');
  });
});
