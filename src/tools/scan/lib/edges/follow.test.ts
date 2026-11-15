import { describe, expect, it } from 'vitest';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { farIsBetter, followEdges, traceSides, type Pins } from './follow.ts';
import { addNoise, fillQuad, fillRect, norm, solid } from './testImages.ts';

const W = 600;
const H = 800;

// A light page, tilted a little, on a darker table; px corners clockwise from the top left.
const TILTED_PX: Quad = [{ x: 110, y: 120 }, { x: 500, y: 100 }, { x: 520, y: 700 }, { x: 130, y: 690 }];
const toUnit = (q: Quad): Quad => q.map((p) => norm(p, W, H)) as Quad;
const TRUE = toUnit(TILTED_PX);

function tiltedPage() {
  const image = solid(W, H, 120);
  fillQuad(image, TILTED_PX, 200);
  addNoise(image, 3, 5);
  return image;
}

// Each corner pushed 4 to 6% of the picture off, in different directions.
const OFF: Quad = [{ x: -0.05, y: -0.04 }, { x: 0.04, y: -0.05 }, { x: 0.06, y: 0.04 }, { x: -0.04, y: 0.05 }]
  .map((d, i) => ({ x: TRUE[i].x + d.x, y: TRUE[i].y + d.y })) as Quad;

const worst = (a: Quad, b: Quad) => Math.max(...a.map((p, i) => Math.max(Math.abs(p.x - b[i].x), Math.abs(p.y - b[i].y))));

describe('followEdges', () => {
  it('pulls corners that start 4 to 6% off onto the corners of a tilted light page on a darker table', () => {
    const { quad } = followEdges(tiltedPage(), OFF);
    expect(worst(quad, TRUE)).toBeLessThan(0.012);
  });

  it('puts the top corners on the paper edge, not on the first line of text just inside it', () => {
    const image = solid(W, H, 120);
    fillRect(image, 100, 100, 400, 600, 200);
    for (let y = 140; y < 660; y += 28) fillRect(image, 220, y, 240, 6, 60);
    addNoise(image, 3, 5);
    const truth = toUnit([{ x: 100, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 700 }, { x: 100, y: 700 }]);
    const start = truth.map((p, i) => (i < 2 ? { x: p.x, y: 143 / H } : p)) as Quad;
    const { quad } = followEdges(image, start);
    expect(Math.abs(quad[0].y - truth[0].y)).toBeLessThan(0.012);
    expect(Math.abs(quad[1].y - truth[1].y)).toBeLessThan(0.012);
    expect(Math.abs(quad[0].x - truth[0].x)).toBeLessThan(0.012);
    expect(Math.abs(quad[1].x - truth[1].x)).toBeLessThan(0.012);
  });

  it('leaves the corners where they were when the picture has no edge at all', () => {
    const image = solid(W, H, 180);
    addNoise(image, 2, 9);
    const { quad } = followEdges(image, OFF);
    expect(worst(quad, OFF)).toBeLessThan(0.002);
  });

  it('keeps every corner inside the picture when two of the start corners lie outside it', () => {
    const start: Quad = [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.85, y: 1.08 }, { x: 0.15, y: 1.08 }];
    const { quad } = followEdges(tiltedPage(), start);
    for (const p of quad) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it('reports 24 followed points per side, each within 3 px of the true edge it followed', () => {
    const { sides } = followEdges(tiltedPage(), OFF);
    expect(sides).toHaveLength(4);
    sides.forEach((side, s) => {
      expect(side).toHaveLength(24);
      const a = TILTED_PX[s]; const b = TILTED_PX[(s + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      for (const p of side) {
        const x = p.x * W; const y = p.y * H;
        const dist = Math.abs((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)) / len;
        expect(dist).toBeLessThan(3);
      }
    });
  });

  it('does not modify the input picture', () => {
    const image = tiltedPage();
    const copy = Uint8ClampedArray.from(image.data);
    followEdges(image, OFF);
    expect(image.data).toEqual(copy);
  });

  // A light page (x 60 to 540) on a darker table, top edge at topY and bottom edge at bottomY, with lines of text down it.
  const pageWithText = (topY: number, bottomY: number, textFrom: number) => {
    const image = solid(W, H, 120);
    fillRect(image, 60, topY, 480, bottomY - topY, 200);
    for (let y = textFrom; y < bottomY - 40; y += 28) fillRect(image, 120, y, 360, 6, 60);
    addNoise(image, 3, 5);
    return image;
  };

  // Protects the far candidate: a start that sits on a title line well inside the page still reaches the real top edge.
  it('finds a top edge 14% of the picture above a title line that the start corners sit on', () => {
    const image = solid(W, H, 120);
    fillRect(image, 60, 48, 480, 692, 200);
    fillRect(image, 216, 160, 168, 8, 60); // the title: 35% of the page width, centred
    for (let y = 270; y < 700; y += 28) fillRect(image, 120, y, 360, 6, 60);
    addNoise(image, 3, 5);
    const truth = toUnit([{ x: 60, y: 48 }, { x: 540, y: 48 }, { x: 540, y: 740 }, { x: 60, y: 740 }]);
    const start = truth.map((p, i) => (i < 2 ? { x: p.x, y: 160 / H } : p)) as Quad;
    const { quad } = followEdges(image, start);
    expect(Math.abs(quad[0].y - truth[0].y)).toBeLessThan(0.015);
    expect(Math.abs(quad[1].y - truth[1].y)).toBeLessThan(0.015);
  });

  // Protects the far candidate's clamped start: corners below the picture still find a bottom edge inside it.
  it('finds a bottom edge at 88% of the height when the start corners lie below the picture', () => {
    const image = pageWithText(100, 704, 150);
    const truth = toUnit([{ x: 60, y: 100 }, { x: 540, y: 100 }, { x: 540, y: 704 }, { x: 60, y: 704 }]);
    const start = truth.map((p, i) => (i >= 2 ? { x: p.x, y: 1.07 } : p)) as Quad;
    const { quad } = followEdges(image, start);
    expect(Math.abs(quad[2].y - truth[2].y)).toBeLessThan(0.015);
    expect(Math.abs(quad[3].y - truth[3].y)).toBeLessThan(0.015);
  });

  // Protects purity: choosing between two candidates keeps the result a function of the picture and start alone.
  it('returns deeply equal results for two calls with the same input', () => {
    const image = tiltedPage();
    expect(followEdges(image, OFF)).toEqual(followEdges(image, OFF));
  });
});

// A page whose corners are PAGE_PX, on a darker table, its top edge bulging up by `bulge` px at the middle (a parabola
// that meets the straight line at both corners).
const PAGE_PX: Quad = [{ x: 100, y: 150 }, { x: 500, y: 150 }, { x: 500, y: 650 }, { x: 100, y: 650 }];
const topCurve = (x: number, bulge: number) => 150 - bulge * 4 * ((x - 100) / 400) * (1 - (x - 100) / 400);
function bowedPage(bulge: number) {
  const image = solid(W, H, 120);
  for (let x = 100; x < 500; x += 1) {
    for (let y = Math.round(topCurve(x + 0.5, bulge)); y < 650; y += 1) image.data[y * W + x] = 200;
  }
  addNoise(image, 3, 5);
  return image;
}
const distToLine = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs((b.x - a.x) * (p.y * H - a.y) - (b.y - a.y) * (p.x * W - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);

describe('traceSides', () => {
  // Protects the common case: a straight page edge stays straight, with 15 points on each side.
  it('traces the straight sides of a light page as 15 points each, within 1.5 px of the line between its corners', () => {
    const image = solid(W, H, 120);
    fillQuad(image, PAGE_PX, 200);
    addNoise(image, 3, 5);
    const sides = traceSides(image, toUnit(PAGE_PX));
    sides.forEach((side, s) => {
      expect(side).toHaveLength(15);
      for (const p of side) expect(distToLine(p, PAGE_PX[s], PAGE_PX[(s + 1) % 4])).toBeLessThan(1.5);
    });
  });

  // Protects the reason the function exists: a curved page edge is followed, not flattened to the line between corners.
  it('follows a top edge bulging 14 px toward the table, while the corners stay held', () => {
    const top = traceSides(bowedPage(14), toUnit(PAGE_PX))[0];
    const px = top.map((p) => ({ x: p.x * W, y: p.y * H }));
    expect(150 - px[7].y).toBeGreaterThanOrEqual(10);
    expect(Math.abs(px[7].y - topCurve(px[7].x, 14))).toBeLessThanOrEqual(2.5);
    for (const i of [0, 14]) expect(Math.abs(px[i].y - topCurve(px[i].x, 14))).toBeLessThanOrEqual(4);
  });

  // Protects the fallback: with no edge anywhere a side is the straight line between its corners.
  it('returns the straight line between the corners when the picture has no edge', () => {
    const image = solid(W, H, 180);
    addNoise(image, 2, 9);
    const quad = toUnit([{ x: 90, y: 130 }, { x: 510, y: 110 }, { x: 530, y: 690 }, { x: 80, y: 700 }]);
    traceSides(image, quad).forEach((side, s) => {
      const a = { x: quad[s].x * W, y: quad[s].y * H };
      const b = { x: quad[(s + 1) % 4].x * W, y: quad[(s + 1) % 4].y * H };
      for (const p of side) expect(distToLine(p, a, b)).toBeLessThan(0.5);
    });
  });

  // Protects the contract the corner editor draws from: points run first corner to second and stay inside the picture.
  it('orders each side from its first corner toward its second and keeps every coordinate within 0 and 1', () => {
    const quad = toUnit([{ x: 60, y: 90 }, { x: 540, y: 70 }, { x: 560, y: 740 }, { x: 40, y: 760 }]);
    const sides = traceSides(tiltedPage(), quad);
    sides.forEach((side, s) => {
      const a = quad[s];
      const dist = side.map((p) => Math.hypot((p.x - a.x) * W, (p.y - a.y) * H));
      for (let k = 1; k < dist.length; k += 1) expect(dist[k]).toBeGreaterThan(dist[k - 1]);
      for (const p of side) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      }
    });
  });

  // Protects purity: the picture is not modified and the result is a function of the picture and quad alone.
  it('leaves the input data unchanged and returns deeply equal results for two calls', () => {
    const image = bowedPage(14);
    const copy = Uint8ClampedArray.from(image.data);
    const first = traceSides(image, toUnit(PAGE_PX));
    expect(image.data).toEqual(copy);
    expect(traceSides(image, toUnit(PAGE_PX))).toEqual(first);
  });

  // Protects against a parallel stronger edge: a black band 25 px outside the left side cannot pull the trace off the page's own edge.
  it('keeps the left side on the page edge when a stronger straight edge runs 25 px outside it', () => {
    const image = solid(W, H, 120);
    fillQuad(image, PAGE_PX, 200);
    fillRect(image, 69, 150, 6, 500, 20); // a black band, x 69 to 75, 25 px outside the page's left edge at x = 100
    addNoise(image, 3, 5);
    const left = traceSides(image, toUnit(PAGE_PX))[3];
    for (const p of left) expect(Math.abs(p.x * W - 100)).toBeLessThan(3);
  });

  // Protects the reason the function exists under the new cost: a real 30 px bow is still followed.
  it('still follows a top edge bulging 30 px toward the table', () => {
    const top = traceSides(bowedPage(30), toUnit(PAGE_PX))[0];
    const px = top.map((p) => ({ x: p.x * W, y: p.y * H }));
    expect(150 - px[7].y).toBeGreaterThanOrEqual(24);
    expect(Math.abs(px[7].y - topCurve(px[7].x, 30))).toBeLessThanOrEqual(3);
  });

  const pageImage = () => {
    const image = solid(W, H, 120);
    fillQuad(image, PAGE_PX, 200);
    addNoise(image, 3, 5);
    return image;
  };
  const flatImage = () => {
    const image = solid(W, H, 180);
    addNoise(image, 2, 9);
    return image;
  };
  const noPins: Pins = [[], [], [], []];
  const px = (p: { x: number; y: number }) => ({ x: p.x * W, y: p.y * H });

  // Protects the point of pinning: a person's point is kept at its distance from the line, the neighbours stay on the edge, other sides are untouched.
  it('puts a pinned top point 20 px above the edge and leaves the other three sides as they were', () => {
    const image = pageImage();
    const quad = toUnit(PAGE_PX);
    const plain = traceSides(image, quad);
    const pins: Pins = [[{ k: 7, at: { x: 300 / W, y: 130 / H } }], [], [], []];
    const pinned = traceSides(image, quad, pins);
    expect(Math.abs(px(pinned[0][7]).y - 130)).toBeLessThanOrEqual(1);
    for (const i of [0, 14]) expect(Math.abs(px(pinned[0][i]).y - 150)).toBeLessThanOrEqual(4);
    for (const s of [1, 2, 3]) expect(pinned[s]).toEqual(plain[s]);
  });

  // Protects the rescue: a person can draw a side where the picture shows no edge at all, and it is not thrown back to the straight line.
  it('keeps a pin on a side with no edge, the rest of the side between the line and the pin', () => {
    const quad = toUnit(PAGE_PX);
    // the left side runs bottom to top: point k sits at y = 650 - 500 * (k + 1) / 16, so point 4 is at y = 493.75
    const pins: Pins = [[], [], [], [{ k: 4, at: { x: 115 / W, y: 493.75 / H } }]];
    const left = traceSides(flatImage(), quad, pins)[3].map(px);
    expect(Math.abs(left[4].x - 115)).toBeLessThanOrEqual(1);
    left.forEach((p, k) => {
      if (k === 4) return;
      expect(p.x).toBeGreaterThanOrEqual(100 - 0.5);
      expect(p.x).toBeLessThanOrEqual(115 + 0.5);
    });
  });

  // Protects jumps being charged, not forbidden: two far-apart pins on one side are both honoured.
  it('honours two pins 50 px apart in offset on one side', () => {
    const pins: Pins = [[{ k: 2, at: { x: (100 + 400 * 3 / 16) / W, y: 175 / H } }, { k: 12, at: { x: (100 + 400 * 13 / 16) / W, y: 125 / H } }], [], [], []];
    const top = traceSides(pageImage(), toUnit(PAGE_PX), pins)[0].map(px);
    expect(Math.abs(top[2].y - 175)).toBeLessThanOrEqual(1);
    expect(Math.abs(top[12].y - 125)).toBeLessThanOrEqual(1);
  });

  // Protects against bad input: a pin off the side's index range or at a non-finite place changes nothing.
  it('ignores a pin with k = 15 and a pin at a NaN place', () => {
    const image = pageImage();
    const quad = toUnit(PAGE_PX);
    const bad: Pins = [[{ k: 15, at: { x: 0.5, y: 0.1 } }, { k: 3, at: { x: NaN, y: 0.1 } }], [], [], []];
    expect(traceSides(image, quad, bad)).toEqual(traceSides(image, quad));
    expect(traceSides(image, quad, noPins)).toEqual(traceSides(image, quad));
  });

  // Protects the pin from straightening its side: after one pin on the drawn curve, the middle still follows the 30 px bulge.
  it('keeps following the edge after a pin: one pin on a 30 px bulge leaves the middle point on the curve', () => {
    const x2 = 100 + 400 * 3 / 16;
    const pins: Pins = [[{ k: 2, at: { x: x2 / W, y: topCurve(x2, 30) / H } }], [], [], []];
    const top = traceSides(bowedPage(30), toUnit(PAGE_PX), pins)[0].map(px);
    expect(Math.abs(top[2].y - topCurve(x2, 30))).toBeLessThanOrEqual(1);
    expect(Math.abs(top[7].y - topCurve(top[7].x, 30))).toBeLessThanOrEqual(3);
  });

  // Protects the unsigned step: a dark page on a light table is followed as well as a light page on a dark one.
  it('follows a dark page on a light table on every side, within 1.5 px of the straight edges', () => {
    const image = solid(W, H, 200);
    fillQuad(image, PAGE_PX, 100);
    addNoise(image, 3, 5);
    traceSides(image, toUnit(PAGE_PX)).forEach((side, s) => {
      for (const p of side) expect(distToLine(p, PAGE_PX[s], PAGE_PX[(s + 1) % 4])).toBeLessThan(1.5);
    });
  });

  // Protects the other sides: pins on the top side change nothing on the right, bottom and left sides.
  it('traces the other three sides exactly as without pins when only the top side has pins', () => {
    const image = pageImage();
    const quad = toUnit(PAGE_PX);
    const plain = traceSides(image, quad);
    const pins: Pins = [[{ k: 3, at: { x: 0.3, y: 140 / H } }, { k: 9, at: { x: 0.6, y: 155 / H } }], [], [], []];
    const pinned = traceSides(image, quad, pins);
    for (const s of [1, 2, 3]) expect(pinned[s]).toEqual(plain[s]);
  });

  // Protects a pin staying where it was dropped: one further from the side than the trace reaches is still honoured,
  // not pulled back to the reach (a pin dragged 30 px landed 8 px short in a real browser, SCAN-75).
  it('keeps a pin 100 px from its side, beyond the trace reach, where it was put', () => {
    const quad = toUnit(PAGE_PX);
    const x7 = 100 + 400 * 8 / 16;
    const pins: Pins = [[{ k: 7, at: { x: x7 / W, y: 250 / H } }], [], [], []];
    const top = traceSides(pageImage(), quad, pins)[0].map(px);
    expect(Math.abs(top[7].y - 250)).toBeLessThanOrEqual(1);
    expect(Math.abs(top[0].y - 150)).toBeLessThan(40); // the side still leaves its corner near the line
  });

  // Protects the picture's frame: a pin outside the picture is held at the picture's edge.
  it('holds a pin 350 px below the picture at its bottom edge', () => {
    const quad = toUnit(PAGE_PX);
    const pins: Pins = [[], [], [{ k: 7, at: { x: 300 / W, y: 1150 / H } }], []];
    const bottom = traceSides(pageImage(), quad, pins)[2].map(px);
    expect(Math.abs(bottom[7].y - H)).toBeLessThanOrEqual(1);
  });
});

describe('farIsBetter', () => {
  const m = [0.5, 0.5, 0.5, 0.5];
  it('judges by the two weakest sides, not the single weakest (the real page that motivated it)', () => {
    expect(farIsBetter([0.17, 0.96, 0.08, 0.67], m, [0.0, 1.0, 0.92, 0.54], m)).toBe(true);
  });
  it('prefers the far candidate when it is a little better on the second-weakest side', () => {
    expect(farIsBetter([1, 1, 0.08, 1], m, [1, 1, 0.13, 1], m)).toBe(true);
  });
  it('falls to total strength when the two weakest sums are equal, far only if strictly greater', () => {
    expect(farIsBetter([0.5, 0.25, 1, 1], [0.1, 0.1, 0.1, 0.1], [0.25, 0.5, 1, 1], [0.2, 0.1, 0.1, 0.1])).toBe(true);
    expect(farIsBetter([0.5, 0.25, 1, 1], [0.2, 0.1, 0.1, 0.1], [0.25, 0.5, 1, 1], [0.1, 0.1, 0.1, 0.1])).toBe(false);
  });
  it('keeps the near candidate on a complete tie', () => {
    expect(farIsBetter([0.5, 0.25, 1, 1], m, [0.5, 0.25, 1, 1], m)).toBe(false);
  });
});
