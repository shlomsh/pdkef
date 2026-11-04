import { describe, expect, it } from 'vitest';
import { withOrientation6 } from './orientation.ts';

const SOI = [0xff, 0xd8];
const JFIF = [0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46]; // APP0, 6 bytes long (length + "JFIF")
const REST = [0xff, 0xdb, 0x00, 0x02, 0xff, 0xd9];

/** Where the EXIF segment landed, and the bytes either side of it. */
function split(bytes: Uint8Array) {
  const at = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0xe1);
  const length = (bytes[at + 2] << 8) | bytes[at + 3];
  return { before: [...bytes.subarray(0, at)], exif: bytes.subarray(at, at + 2 + length), after: [...bytes.subarray(at + 2 + length)] };
}

describe('withOrientation6', () => {
  it('puts the EXIF segment after the JFIF header, the rest untouched', () => {
    const { before, exif, after } = split(withOrientation6(Uint8Array.from([...SOI, ...JFIF, ...REST])));
    expect(before).toEqual([...SOI, ...JFIF]);
    expect(after).toEqual(REST);
    expect(String.fromCharCode(...exif.subarray(4, 8))).toBe('Exif');
    // Big-endian TIFF, one IFD entry: tag 0x0112 (Orientation), SHORT, count 1, value 6.
    expect([...exif.subarray(20, 30)]).toEqual([0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06]);
  });

  it('puts it straight after the start marker when there is no JFIF header', () => {
    const { before, after } = split(withOrientation6(Uint8Array.from([...SOI, ...REST])));
    expect(before).toEqual(SOI);
    expect(after).toEqual(REST);
  });
});
