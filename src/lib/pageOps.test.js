import { describe, expect, it } from 'vitest';
import { pageNumberPlacement } from './pageOps.js';

const box = { x: 0, y: 0, width: 600, height: 800 };
const tw = 10;

describe('pageNumberPlacement', () => {
  it('rotation 0 at origin (0,0) matches the historic geometry', () => {
    expect(pageNumberPlacement({ box, rotation: 0, textWidth: tw })).toEqual({ x: 295, y: 22, rotate: 0 });
  });

  it('rotation 90 sits on the unrotated right edge, text running up', () => {
    expect(pageNumberPlacement({ box, rotation: 90, textWidth: tw })).toEqual({ x: 578, y: 395, rotate: 90 });
  });

  it('rotation 180 sits on the unrotated top edge, upside down', () => {
    expect(pageNumberPlacement({ box, rotation: 180, textWidth: tw })).toEqual({ x: 305, y: 778, rotate: 180 });
  });

  it('rotation 270 sits on the unrotated left edge, text running down', () => {
    expect(pageNumberPlacement({ box, rotation: 270, textWidth: tw })).toEqual({ x: 22, y: 405, rotate: 270 });
  });

  it('offsets by a box whose origin is not (0,0)', () => {
    const offset = { x: 10, y: 20, width: 600, height: 800 };
    expect(pageNumberPlacement({ box: offset, rotation: 0, textWidth: tw })).toEqual({ x: 305, y: 42, rotate: 0 });
    expect(pageNumberPlacement({ box: offset, rotation: 90, textWidth: tw })).toEqual({ x: 588, y: 415, rotate: 90 });
  });

  it('normalizes negative and over-360 angles', () => {
    const at90 = pageNumberPlacement({ box, rotation: 90, textWidth: tw });
    expect(pageNumberPlacement({ box, rotation: -270, textWidth: tw })).toEqual(at90);
    expect(pageNumberPlacement({ box, rotation: 450, textWidth: tw })).toEqual(at90);
    expect(pageNumberPlacement({ box, rotation: 360, textWidth: tw }).rotate).toBe(0);
  });
});
