import { describe, expect, it } from 'vitest';
import { FLIGHT_ROUTES, PACE, TICK, flightRoute, theOTimeline, theOTimelineCss } from './theOTimeline.ts';

const timeline = theOTimeline();
const ticks = (svh: number) => svh / TICK;
const length = ([start, end]: readonly [number, number]) => end - start;

describe('theOTimeline', () => {
  it('lights all six cards in order', () => {
    expect(timeline.lit).toHaveLength(6);
    timeline.lit.slice(1).forEach((svh, i) => expect(svh).toBeGreaterThan(timeline.lit[i]));
  });

  it('tells the whole story in at most a hundred ticks', () => {
    expect(ticks(timeline.total)).toBeLessThanOrEqual(100);
  });

  it('gives every colour wipe and shape change at least five ticks', () => {
    Object.values(timeline.wipes).forEach((wipe) => expect(ticks(length(wipe))).toBeGreaterThanOrEqual(5));
    expect(ticks(length(timeline.intoO))).toBeGreaterThanOrEqual(5);
    expect(ticks(length(timeline.intoWindow))).toBeGreaterThanOrEqual(5);
  });

  it('holds one tick once a change has finished, then lights the words', () => {
    expect(ticks(timeline.lit[1] - timeline.wipes[2][1])).toBe(1);
    expect(ticks(timeline.lit[2] - timeline.wipes[3][1])).toBe(1);
    expect(ticks(timeline.lit[3] - timeline.intoO[1])).toBe(1);
    expect(ticks(timeline.lit[4] - timeline.intoWindow[1])).toBe(1);
  });

  it('stalls on every card, words lit and nothing moving, for four to six ticks', () => {
    const stalls = [
      timeline.wipes[2][0] - timeline.lit[0],
      timeline.wipes[3][0] - timeline.lit[1],
      timeline.wipes[4][0] - timeline.lit[2],
      timeline.wipes[5][0] - timeline.lit[3],
    ];
    stalls.forEach((stall) => {
      expect(ticks(stall)).toBeGreaterThanOrEqual(4);
      expect(ticks(stall)).toBeLessThanOrEqual(6);
    });
  });

  it('beats the three zeros at one tempo, and gives the turn into the O more room', () => {
    const card2 = timeline.wipes[3][0] - timeline.wipes[2][0];
    const card3 = timeline.wipes[4][0] - timeline.wipes[3][0];
    const card4 = timeline.wipes[5][0] - timeline.wipes[4][0];
    expect(card3 - card2).toBe(TICK);
    expect(ticks(card2)).toBeLessThanOrEqual(10);
    expect(card4).toBeGreaterThan(card3);
  });

  it('starts rounding the zero into the O while its card is still opening', () => {
    expect(timeline.intoO[0]).toBeGreaterThan(timeline.wipes[4][0]);
    expect(timeline.intoO[0]).toBeLessThan(timeline.wipes[4][1]);
  });

  it('keeps the O as it is until the night card has opened around it', () => {
    expect(timeline.intoWindow[0]).toBeGreaterThanOrEqual(timeline.wipes[5][1]);
  });

  it('lights the window\'s words with its shade still down, a tick after the window forms', () => {
    expect(timeline.lit[4]).toBeLessThan(timeline.shade[0]);
  });

  it('raises the shade alone: nothing else moves from two ticks before it to two ticks after', () => {
    expect(ticks(timeline.shade[0] - timeline.lit[4])).toBeGreaterThanOrEqual(2);
    expect(ticks(length(timeline.shade))).toBeGreaterThanOrEqual(7);
    expect(timeline.shade[0]).toBeGreaterThan(timeline.intoWindow[1]);
    expect(ticks(timeline.toggle[0] - timeline.shade[1])).toBeGreaterThanOrEqual(2);
  });

  it('switches airplane mode on over two ticks, then stalls two more before take-off', () => {
    expect(ticks(length(timeline.toggle))).toBe(2);
    expect(ticks(timeline.takeoff - timeline.toggle[1])).toBeGreaterThanOrEqual(2);
  });

  it('lifts off before it climbs, and rolls into paper over at least five ticks', () => {
    expect(timeline.waypoints.lift).toBeGreaterThan(timeline.takeoff);
    expect(timeline.waypoints.lift).toBeLessThan(timeline.waypoints.climb);
    expect(ticks(length(timeline.roll))).toBeGreaterThanOrEqual(5);
  });

  it('opens the last card from the paper plane as its roll finishes', () => {
    expect(timeline.wipes[6][0]).toBeGreaterThan(timeline.swap);
    expect(timeline.wipes[6][0]).toBeLessThanOrEqual(timeline.roll[1]);
  });

  it('swaps the plane for paper at the middle of the roll', () => {
    expect(timeline.swap).toBeGreaterThan(timeline.roll[0]);
    expect(timeline.swap).toBeLessThan(timeline.roll[1]);
  });

  it('flies its route at one speed, nose never turning back, and lands level', () => {
    for (const route of FLIGHT_ROUTES) {
      const samples = flightRoute(route);
      expect(samples[0].at).toBe(0);
      expect(samples[samples.length - 1].at).toBe(1);
      samples.slice(1).forEach((sample, i) => {
        expect(sample.at).toBeGreaterThan(samples[i].at);
        expect(sample.heading).toBeLessThanOrEqual(samples[i].heading + 15);
      });
      const final = samples[samples.length - 1];
      expect(final.v).toBe(1);
      expect(final.heading).toBe(-360);
      // A long low final: the last fifth of the flight is within a tenth of the runway.
      samples.filter((sample) => sample.at >= 0.8).forEach((sample) => expect(sample.v).toBeGreaterThanOrEqual(0.9));
    }
  });

  it('draws the runway in before the words light, and lights them before touchdown', () => {
    expect(timeline.runway[0]).toBeGreaterThan(timeline.wipes[6][0]);
    expect(timeline.runway[1]).toBeLessThanOrEqual(timeline.lit[5]);
    expect(ticks(timeline.waypoints.land - timeline.lit[5])).toBeGreaterThanOrEqual(2);
  });

  it('rolls out for three ticks after touchdown, then rests', () => {
    expect(ticks(timeline.waypoints.stop - timeline.waypoints.land)).toBeGreaterThanOrEqual(3);
    expect(timeline.total - timeline.waypoints.stop).toBe(PACE.landed);
    expect(ticks(PACE.landed)).toBeGreaterThanOrEqual(6);
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
    expect(css).toContain('--o-off: 1; }');
    expect(css).toContain('--o-landed: 1; }');
  });
});
