import { describe, expect, it } from 'vitest';
import { encodePgm, parsePgm } from './pgm.ts';

const bytes = (s: string, tail: number[]) => Uint8Array.from([...Array.from(s, (c) => c.charCodeAt(0)), ...tail]);

describe('pgm', () => {
  it('round-trips an image', () => {
    const image = { width: 3, height: 2, data: Uint8ClampedArray.from([0, 10, 20, 30, 255, 128]) };
    const back = parsePgm(encodePgm(image));
    expect(back.width).toBe(3);
    expect(back.height).toBe(2);
    expect(Array.from(back.data)).toEqual(Array.from(image.data));
  });

  it('writes a plain P5 header', () => {
    const out = encodePgm({ width: 2, height: 1, data: Uint8ClampedArray.from([1, 2]) });
    expect(new TextDecoder().decode(out.slice(0, 11))).toBe('P5\n2 1\n255\n');
    expect(out.length).toBe(11 + 2);
  });

  it('allows comments in the header', () => {
    const img = parsePgm(bytes('P5\n# made by hand\n2 1 # size\n255\n', [7, 9]));
    expect(Array.from(img.data)).toEqual([7, 9]);
  });

  it('allows a pixel that looks like whitespace', () => {
    const img = parsePgm(bytes('P5 2 1 255\n', [10, 32]));
    expect(Array.from(img.data)).toEqual([10, 32]);
  });

  it('rejects other formats, other depths and short data', () => {
    expect(() => parsePgm(bytes('P2\n1 1\n255\n', [0]))).toThrow();
    expect(() => parsePgm(bytes('P5\n1 1\n65535\n', [0, 0]))).toThrow();
    expect(() => parsePgm(bytes('P5\n2 2\n255\n', [0, 0]))).toThrow();
  });
});
