import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrayImage, Quad, RgbaImage } from '#lib/pageEnhance/quad.ts';
import { FLAT_PAGE, bentPx, measureBend } from '#lib/pageEnhance/dewarp/index.ts';
import { spreadQuads } from '#lib/pageEnhance/plan.ts';
import { warpPerspective } from '#lib/pageEnhance/warp.ts';
import type { Pins } from '../edges/follow.ts';
import { traceSides } from '../edges/follow.ts';
import { evenMargins } from '../evenMargins.ts';
import { FULL_QUAD } from '../quad.ts';
import { curvesFromSides } from './tracedCurves.ts';
import { processPixels, settle, splitFromGray, traceGray } from './processPixels.ts';

// The real modules run; the spies show what they were handed. A test that forces a failure does so on one call with mock*Once.
vi.mock('#lib/pageEnhance/dewarp/index.ts', { spy: true });
vi.mock('#lib/pageEnhance/plan.ts', { spy: true });
vi.mock('#lib/pageEnhance/warp.ts', { spy: true });
vi.mock('../edges/follow.ts', { spy: true });
vi.mock('./tracedCurves.ts', { spy: true });
vi.mock('../evenMargins.ts', { spy: true });

type Rgb = [number, number, number];
const GRAY: Rgb = [128, 128, 128];

const rgbaOf = (width: number, height: number, pixel: (x: number, y: number) => Rgb = () => GRAY): RgbaImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set([...pixel(x, y), 255], (y * width + x) * 4);
  }
  return { width, height, data };
};

const grayOf = (width: number, height: number, value: (x: number, y: number) => number = () => 128): GrayImage => {
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data[y * width + x] = value(x, y);
  }
  return { width, height, data };
};

const q = (...c: number[]): Quad => [{ x: c[0], y: c[1] }, { x: c[2], y: c[3] }, { x: c[4], y: c[5] }, { x: c[6], y: c[7] }];
const INNER: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
const PINS: Pins = [[{ k: 0.5, at: { x: 0.5, y: 0.12 } }], [], [], []];
const lastBendArgs = () => vi.mocked(measureBend).mock.calls.at(-1)!;

beforeEach(() => {
  vi.mocked(measureBend).mockClear();
  vi.mocked(traceSides).mockClear();
  vi.mocked(curvesFromSides).mockClear();
  vi.mocked(evenMargins).mockClear();
  vi.mocked(warpPerspective).mockClear();
  vi.mocked(spreadQuads).mockClear();
});

describe('processPixels', () => {
  it('crops a photo inside its corners, and never a PDF sheet: its corners are exact and its print can run to the edge', () => {
    const photo = processPixels(rgbaOf(400, 300), null, FULL_QUAD, 'original', true, null);
    const sheet = processPixels(rgbaOf(400, 300), null, FULL_QUAD, 'original', false, null);
    expect([photo.image.width, photo.image.height]).toEqual([394, 295]);
    expect([sheet.image.width, sheet.image.height]).toEqual([400, 300]);
  });

  it('crops 1.6% in from the corners, so the page outline never shows as a dark edge line', () => {
    // A 2px dark table border around mid-gray paper: the sliver the edge guess can leave inside its corners.
    const bordered = rgbaOf(400, 300, (x, y) => (x < 2 || y < 2 || x >= 400 - 2 || y >= 300 - 2 ? [0, 0, 0] : GRAY));
    const { image } = processPixels(bordered, null, FULL_QUAD, 'original', true, null);
    expect(image.data.length).toBe(image.width * image.height * 4);
    for (let i = 0; i < image.data.length; i += 4) expect([image.data[i], image.data[i + 1], image.data[i + 2]]).toEqual(GRAY);
  });

  it('warps exactly the inset corners, in photo pixels, and sizes the page from them', () => {
    const { image } = processPixels(rgbaOf(400, 300), null, q(0.1, 0.2, 0.9, 0.1, 0.8, 0.9, 0.2, 0.8), 'original', true, null);
    const [src, quadPx, width, height] = vi.mocked(warpPerspective).mock.calls[0];
    expect([src.width, src.height]).toEqual([400, 300]);
    // Each corner moves 1.6% of the way to the quad's centre (0.5, 0.5), then scales to 400 x 300.
    const expected = [[42.56, 61.44], [357.44, 31.92], [318.08, 268.08], [81.92, 238.56]];
    quadPx.forEach((p, i) => {
      expect(p.x).toBeCloseTo(expected[i][0], 6);
      expect(p.y).toBeCloseTo(expected[i][1], 6);
    });
    expect([width, height]).toEqual([image.width, image.height]);
    // The longer of each pair of opposite edges: top 316.3 / bottom 238.0 wide, left 181.4 / right 239.4 tall.
    // 316/239 = 1.322 is within 3% of US Letter (1.294), so the page snaps to Letter: 316 x 244.
    expect([image.width, image.height]).toEqual([316, 244]);
  });

  it('reads paper edges on a photo, and none on a PDF sheet', () => {
    processPixels(rgbaOf(400, 300), null, FULL_QUAD, 'original', true, null);
    processPixels(rgbaOf(400, 300), null, FULL_QUAD, 'original', false, null);
    expect(vi.mocked(measureBend).mock.calls.map((call) => call[5])).toEqual([true, false]);
  });

  it('flattens a flat page by its corners alone: no bend, nothing to report', () => {
    const { image, bentPx, measureError } = processPixels(rgbaOf(400, 300), null, FULL_QUAD, 'original', true, null);
    expect(measureError).toBeNull();
    expect(bentPx).toBe(0);
    expect([image.width, image.height]).toEqual([394, 295]);
  });

  it('hands back a measuring failure with the page, flattened by its corners', () => {
    const error = new Error('measure failed');
    const bend = settle(() => { throw error; }, FLAT_PAGE);
    expect(bend.error).toBe(error);
    expect(bend.value).toBe(FLAT_PAGE);
    expect(bentPx(bend.value, 0, 394, 295)).toBe(0);
    expect(settle(() => 7, 0)).toEqual({ value: 7, error: null });
    // Forced: no real photo makes measureBend throw while the rest of the page still flattens
    vi.mocked(measureBend).mockImplementationOnce(() => { throw error; });
    const flat = processPixels(rgbaOf(400, 300), null, FULL_QUAD, 'original', true, null);
    expect(flat.measureError).toBe(error);
    expect(flat.bentPx).toBe(0);
    expect(flat.image.width).toBe(394);
  });

  it('paints the dark triangle a pinned sheet leaves in a corner in the paper colour', () => {
    const [w, h] = [400, 300];
    const folded = rgbaOf(w, h, (x, y) => (w - 1 - x + y <= 60 ? [20, 20, 20] : [230, 230, 230]));
    const { image } = processPixels(folded, null, FULL_QUAD, 'original', true, null);
    const corner = (image.width - 1) * 4;
    expect([image.data[corner], image.data[corner + 1], image.data[corner + 2]]).toEqual([230, 230, 230]);
  });

  it('sizes a strongly tilted A4 page to its true 1.414 proportions, not to its edge lengths', () => {
    // An A4 page seen by a pinhole camera (focal 0.75 x the long side), tilted 50 degrees, as normalized corners.
    const [W, H, f, tilt] = [1600, 1200, 0.75 * 1600, (50 * Math.PI) / 180];
    const quad = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => {
      const x = (sx * Math.SQRT2) / 2;
      const y = sy / 2;
      const z = 2.5 + y * Math.sin(tilt);
      return { x: (W / 2 + (f * x) / z) / W, y: (H / 2 + (f * y * Math.cos(tilt)) / z) / H };
    }) as unknown as Quad;
    const { image } = processPixels(rgbaOf(W, H), null, quad, 'original', true, null);
    expect(Math.max(image.width, image.height) / Math.min(image.width, image.height)).toBeCloseTo(Math.SQRT2, 2);
  });
});

describe('processPixels even margins', () => {
  // A book page whose text block runs close to its left edge: 30 rows of bars from x 40 to 490 on a 600 px page.
  const squeezed = () => rgbaOf(600, 800, (x, y) => {
    const r = Math.floor((y - 60) / 22);
    const inRow = r >= 0 && r < 30 && (y - 60) % 22 < 10;
    const word = (x - 40) % 57;
    return inRow && x >= 40 && x < 490 && word < 51 ? [25, 25, 25] : [230, 230, 230];
  });

  it('centres a photographed page\'s text between even margins, padding the thin side', () => {
    const { image } = processPixels(squeezed(), null, FULL_QUAD, 'original', true, null);
    expect(evenMargins).toHaveBeenCalledTimes(1);
    const [call] = vi.mocked(evenMargins).mock.calls;
    const { width, height } = call[0];
    expect(image.height).toBe(height);
    expect(image.width).toBeGreaterThan(width + 50);
  });

  it('leaves a PDF sheet as it was printed, margins and all', () => {
    processPixels(squeezed(), null, FULL_QUAD, 'original', false, null);
    expect(evenMargins).not.toHaveBeenCalled();
  });
});

describe('processPixels traced border', () => {
  // A page whose top and bottom edges bow outward (a quadratic through (300, 20) and (300, 780)) on a dark desk, drawn as
  // paper where the page is, as both the photo's pixels and the gray copy the editor traces.
  const W = 600;
  const H = 800;
  const onPaper = (x: number, y: number) => {
    if (x < 60 || x > 540) return false;
    const t = (x - 60) / 480;
    const bow = 120 * t * (1 - t);
    return y >= 80 - bow && y <= 720 + bow;
  };
  const bowedPhoto = () => rgbaOf(W, H, (x, y) => (onPaper(x, y) ? [242, 239, 230] : [43, 33, 24]));
  const bowedGray = () => grayOf(W, H, (x, y) => (onPaper(x, y) ? 240 : 36));

  it('hands the bend measure the curves traced from the sides the editor draws, so the flattening follows the drawn border', () => {
    const { bentPx } = processPixels(bowedPhoto(), bowedGray(), INNER, 'original', true, PINS);
    expect(bentPx).toBeGreaterThan(0);
    const sides = vi.mocked(traceSides).mock.results[0].value;
    const curves = vi.mocked(curvesFromSides).mock.results[0].value;
    expect(curves).not.toBeNull();
    expect(curvesFromSides).toHaveBeenCalledWith(INNER, sides, W, H);
    expect(lastBendArgs()[6]).toBe(curves);
  });

  it('traces on the gray copy it is given, with the page quad and its pins as they came', () => {
    const gray = grayOf(300, 200);
    processPixels(rgbaOf(400, 300), gray, INNER, 'original', true, PINS);
    const [image, quad, pins] = vi.mocked(traceSides).mock.calls[0];
    expect(image).toBe(gray);
    expect(quad).toBe(INNER);
    expect(pins).toBe(PINS);
  });

  it('traces a fine PDF sheet with an inner quad too: paperEdges only means the inset crop', () => {
    processPixels(rgbaOf(400, 300), grayOf(400, 300), INNER, 'original', false, null);
    expect(traceSides).toHaveBeenCalledTimes(1);
    expect(lastBendArgs()[5]).toBe(false);
    expect(lastBendArgs()).toHaveLength(7);
  });

  it('measures the bend as before when there is no gray copy to trace', () => {
    processPixels(rgbaOf(400, 300), null, INNER, 'original', false, PINS);
    expect(traceSides).not.toHaveBeenCalled();
    expect(lastBendArgs()).toHaveLength(6);
  });

  it('still produces the page when tracing throws, measures it as before, and hands the error back to be reported', () => {
    // A gray copy with no pixels: the real trace throws on it.
    const unreadable = { width: 400, height: 300, data: null } as unknown as GrayImage;
    const { image, measureError } = processPixels(rgbaOf(400, 300), unreadable, INNER, 'original', true, null);
    expect(measureError).toBeInstanceOf(TypeError);
    expect(lastBendArgs()).toHaveLength(6);
    expect(image.width).toBeGreaterThan(0);
  });
});

describe('traceGray', () => {
  const gray = grayOf(40, 30);

  it('reads the gray copy for a fine page', () => {
    let reads = 0;
    const read = () => { reads += 1; return gray; };
    const traced = traceGray(INNER, true, read);
    expect(reads).toBe(1);
    expect(traced.gray).toBe(gray);
    expect(traced.error).toBeNull();
  });

  it('reads nothing for the whole picture, in any corner order', () => {
    let reads = 0;
    const read = () => { reads += 1; return gray; };
    const [tl, tr, br, bl] = FULL_QUAD;
    for (const quad of [FULL_QUAD, [bl, tl, tr, br], [br, bl, tl, tr]] as Quad[]) {
      expect(traceGray(quad, true, read)).toEqual({ gray: null, error: null });
    }
    expect(reads).toBe(0);
  });

  it('reads nothing for a page that is not fine', () => {
    let reads = 0;
    const read = () => { reads += 1; return gray; };
    expect(traceGray(INNER, false, read)).toEqual({ gray: null, error: null });
    expect(reads).toBe(0);
  });

  it('reads nothing for a whole picture whatever fine says, and reads a fine inner page', () => {
    let reads = 0;
    const read = () => { reads += 1; return gray; };
    traceGray(INNER, true, read);
    expect(reads).toBe(1);
    traceGray(FULL_QUAD, true, read);
    expect(reads).toBe(1);
  });

  it('hands back a failure to read the copy, and no gray', () => {
    const error = new Error('no canvas');
    expect(traceGray(INNER, true, () => { throw error; })).toEqual({ gray: null, error });
  });
});

describe('splitFromGray', () => {
  const spine = { top: 0.5, bottom: 0.5 };

  // Two pages leaning by `lean` radians either side of the middle of a W x H picture, each with rows of print.
  const leaningSpread = (W: number, H: number, lean: number): GrayImage => {
    const cos = Math.cos(lean);
    const sin = Math.sin(lean);
    return grayOf(W, H, (px, py) => {
      for (const centre of [W * 0.25, W * 0.75]) {
        const dx = px - centre;
        const dy = py - H / 2;
        const x = dx * cos + dy * sin;
        const y = -dx * sin + dy * cos;
        if (Math.abs(x) <= W * 0.24 && Math.abs(y) <= H * 0.46) {
          const row = y + H * 0.4;
          const inRow = row >= 0 && Math.floor(row / 16) < 28 && row % 16 < 5 && Math.abs(x) <= W * 0.2;
          return inRow ? 34 : 242;
        }
      }
      return 43;
    });
  };

  it('keeps every corner on the picture, where the corner editor can reach it', () => {
    const quads = splitFromGray(leaningSpread(1000, 625, 0.06), spine);
    const raw = vi.mocked(spreadQuads).mock.results.at(-1)!.value.flat() as { x: number; y: number }[];
    expect(quads).toHaveLength(2);
    expect(raw.some(({ x, y }) => Math.min(x, y) < 0 || Math.max(x, y) > 1)).toBe(true);
    quads.flat().forEach(({ x, y }, i) => {
      expect(Math.min(x, y)).toBeGreaterThanOrEqual(0);
      expect(Math.max(x, y)).toBeLessThanOrEqual(1);
      expect([x, y]).toEqual([raw[i].x, raw[i].y].map((n) => Math.min(1, Math.max(0, n))));
    });
  });

  it('reads the gray copy it is given for the spine the person placed', () => {
    const gray = leaningSpread(1000, 625, 0.06);
    const placed = { top: 0.48, bottom: 0.52 };
    splitFromGray(gray, placed);
    expect(spreadQuads).toHaveBeenLastCalledWith(gray, placed);
  });
});
