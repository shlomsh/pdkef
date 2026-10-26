import { describe, expect, it } from 'vitest';
import { LOUPE_GAP, LOUPE_MARGIN, LOUPE_SIZE, LOUPE_ZOOM, loupeView, placeLoupe, type LoupeEdge } from './loupe.ts';

const PHONE = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

/** Shortest distance from a point to the loupe's square. */
const distance = (touch: { x: number; y: number }, at: { left: number; top: number }) => {
  const dx = Math.max(at.left - touch.x, 0, touch.x - (at.left + LOUPE_SIZE));
  const dy = Math.max(at.top - touch.y, 0, touch.y - (at.top + LOUPE_SIZE));
  return Math.hypot(dx, dy);
};
const onScreen = (at: { left: number; top: number }, viewport: { width: number; height: number }) =>
  at.left >= LOUPE_MARGIN && at.top >= LOUPE_MARGIN
  && at.left + LOUPE_SIZE <= viewport.width - LOUPE_MARGIN && at.top + LOUPE_SIZE <= viewport.height - LOUPE_MARGIN;

describe('placeLoupe', () => {
  it('sits above the finger, centred on it, when there is room', () => {
    const at = placeLoupe({ x: 200, y: 500 }, PHONE);
    expect(at.top + LOUPE_SIZE).toBeLessThanOrEqual(500 - LOUPE_GAP);
    expect(at.left + LOUPE_SIZE / 2).toBe(200);
  });

  it('slides along the edge rather than leaving the screen near a side', () => {
    const at = placeLoupe({ x: 20, y: 500 }, PHONE);
    expect(onScreen(at, PHONE)).toBe(true);
    expect(at.top + LOUPE_SIZE).toBeLessThanOrEqual(500 - LOUPE_GAP);
  });

  it('goes beside the finger, towards the middle, near the top edge', () => {
    const left = placeLoupe({ x: 60, y: 90 }, PHONE);
    expect(left.left).toBeGreaterThanOrEqual(60 + LOUPE_GAP);
    const right = placeLoupe({ x: 330, y: 90 }, PHONE);
    expect(right.left + LOUPE_SIZE).toBeLessThanOrEqual(330 - LOUPE_GAP);
  });

  it('stays on screen and off the finger in every corner, portrait and landscape', () => {
    for (const viewport of [PHONE, LANDSCAPE]) {
      const points = [
        { x: 10, y: 10 }, { x: viewport.width - 10, y: 10 },
        { x: 10, y: viewport.height - 10 }, { x: viewport.width - 10, y: viewport.height - 10 },
        { x: viewport.width / 2, y: 20 }, { x: viewport.width / 2, y: viewport.height / 2 },
      ];
      for (const touch of points) {
        const at = placeLoupe(touch, viewport);
        expect(onScreen(at, viewport), JSON.stringify({ viewport, touch, at })).toBe(true);
        expect(distance(touch, at), JSON.stringify({ viewport, touch, at })).toBeGreaterThanOrEqual(LOUPE_GAP);
      }
    }
  });

  it('in landscape near the top, goes beside the finger instead of above it', () => {
    const at = placeLoupe({ x: 300, y: 60 }, LANDSCAPE);
    expect(at.left).toBeGreaterThanOrEqual(300 + LOUPE_GAP);
  });
});

describe('loupeView', () => {
  const quad = [{ x: 0.25, y: 0.2 }, { x: 0.75, y: 0.2 }, { x: 0.75, y: 0.8 }, { x: 0.25, y: 0.8 }];
  const image = { width: 400, height: 300 };

  it('magnifies the photo with the corner at the loupe centre', () => {
    const view = loupeView(quad[0], [quad[1], quad[3]], image);
    expect(view.backgroundSize).toBe(`${400 * LOUPE_ZOOM}px ${300 * LOUPE_ZOOM}px`);
    // The corner, 100px x 60px into the photo, lands on the centre once magnified.
    expect(view.backgroundPosition).toBe(`${LOUPE_SIZE / 2 - 100 * LOUPE_ZOOM}px ${LOUPE_SIZE / 2 - 60 * LOUPE_ZOOM}px`);
  });

  it('draws the two adjacent edges from the centre towards their corners', () => {
    const [toNext, toPrevious] = loupeView(quad[0], [quad[1], quad[3]], image).edges;
    const c = LOUPE_SIZE / 2;
    const near = (edge: LoupeEdge, want: LoupeEdge) => (Object.keys(want) as (keyof LoupeEdge)[]).forEach((k) => expect(edge[k]).toBeCloseTo(want[k], 6));
    near(toNext, { x1: c, y1: c, x2: c + 200 * LOUPE_ZOOM, y2: c });
    near(toPrevious, { x1: c, y1: c, x2: c, y2: c + 180 * LOUPE_ZOOM });
  });
});
