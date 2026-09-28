import { describe, it, expect } from 'vitest';
import { boxSolidity } from './boxSolidity.ts';
import type { CheckBox } from './types.ts';

const WIDTH = 100;
const HEIGHT = 100;

function makeImage(fill: [number, number, number]) {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width: WIDTH, height: HEIGHT };
}

function setPixel(image: { data: Uint8ClampedArray; width: number }, x: number, y: number, color: [number, number, number]) {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = color[0];
  image.data[offset + 1] = color[1];
  image.data[offset + 2] = color[2];
  image.data[offset + 3] = 255;
}

const BLACKOUT_BOX: CheckBox = { pageIndex: 0, type: 'blackout', left: 10, top: 10, width: 50, height: 50 };
const WHITEOUT_BOX: CheckBox = { pageIndex: 0, type: 'whiteout', left: 10, top: 10, width: 50, height: 50 };
const BLUR_BOX: CheckBox = { pageIndex: 0, type: 'blur', left: 10, top: 10, width: 50, height: 50 };

describe('boxSolidity', () => {
  it('passes a solid black blackout box', () => {
    const image = makeImage([0, 0, 0]);
    const results = boxSolidity(image, [BLACKOUT_BOX]);
    expect(results).toEqual([{ boxIndex: 0, solid: true }]);
  });

  it('fails when a bright pixel sits inside the inset area', () => {
    const image = makeImage([0, 0, 0]);
    // Box spans x:[10,60), y:[10,60). Inset default is 2px, so (30, 30) is
    // well inside the checked area.
    setPixel(image, 30, 30, [255, 255, 255]);
    const results = boxSolidity(image, [BLACKOUT_BOX]);
    expect(results).toEqual([{ boxIndex: 0, solid: false }]);
  });

  it('passes when the bright pixel is only in the inset margin', () => {
    const image = makeImage([0, 0, 0]);
    // Box top-left corner is (10, 10); a pixel right at the edge falls
    // inside the default 2px inset margin and is skipped.
    setPixel(image, 10, 10, [255, 255, 255]);
    const results = boxSolidity(image, [BLACKOUT_BOX]);
    expect(results).toEqual([{ boxIndex: 0, solid: true }]);
  });

  it('passes a solid white whiteout box', () => {
    const image = makeImage([255, 255, 255]);
    const results = boxSolidity(image, [WHITEOUT_BOX]);
    expect(results).toEqual([{ boxIndex: 0, solid: true }]);
  });

  it('fails a whiteout box with a dark pixel inside', () => {
    const image = makeImage([255, 255, 255]);
    setPixel(image, 30, 30, [0, 0, 0]);
    const results = boxSolidity(image, [WHITEOUT_BOX]);
    expect(results).toEqual([{ boxIndex: 0, solid: false }]);
  });

  it('skips blur boxes entirely', () => {
    const image = makeImage([128, 128, 128]);
    const results = boxSolidity(image, [BLUR_BOX]);
    expect(results).toEqual([]);
  });

  it('checks multiple boxes and reports each by its index', () => {
    const image = makeImage([0, 0, 0]);
    const boxes: CheckBox[] = [
      BLUR_BOX,
      BLACKOUT_BOX,
      { ...BLACKOUT_BOX, left: 60, top: 60, width: 30, height: 30 },
    ];
    setPixel(image, 70, 70, [255, 255, 255]);
    const results = boxSolidity(image, boxes);
    expect(results).toEqual([
      { boxIndex: 1, solid: true },
      { boxIndex: 2, solid: false },
    ]);
  });

  it('respects a custom color and tolerance', () => {
    const image = makeImage([10, 10, 10]);
    const box: CheckBox = { ...BLACKOUT_BOX, color: '#0a0a0a' };
    const results = boxSolidity(image, [box], { tolerance: 5 });
    expect(results).toEqual([{ boxIndex: 0, solid: true }]);
  });
});
