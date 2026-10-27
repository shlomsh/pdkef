import { describe, expect, it } from 'vitest';
import { exifOrientation, stripExif } from './jpegBytes.js';

const B64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const base = () => new Uint8Array(Buffer.from(B64, 'base64'));

const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

function segment(marker, payload) {
  const len = payload.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...payload];
}

function exifSegment(orientation, little = true) {
  const u16 = (n) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n) => (little ? [n & 0xff, 0, 0, 0] : [0, 0, 0, n & 0xff]);
  const tiff = [
    ...ascii(little ? 'II' : 'MM'),
    ...u16(42),
    ...u32(8),
    ...u16(1),
    ...u16(0x0112),
    ...u16(3),
    ...u32(1),
    ...u16(orientation),
    0,
    0,
    ...u32(0),
  ];
  return segment(0xe1, [...ascii('Exif'), 0, 0, ...tiff]);
}

const xmpSegment = () => segment(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0, 1, 2, 3]);

function splice(jpeg, ...segs) {
  return new Uint8Array([0xff, 0xd8, ...segs.flat(), ...jpeg.subarray(2)]);
}

describe('exifOrientation', () => {
  it('reads little-endian and big-endian tags', () => {
    expect(exifOrientation(splice(base(), exifSegment(6, true)))).toBe(6);
    expect(exifOrientation(splice(base(), exifSegment(3, false)))).toBe(3);
  });
  it('is null without EXIF, for non-JPEGs and for out-of-range values', () => {
    expect(exifOrientation(base())).toBeNull();
    expect(exifOrientation(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(exifOrientation(splice(base(), exifSegment(9)))).toBeNull();
  });
});

describe('stripExif', () => {
  it('removes the Exif segment, restoring the original bytes', () => {
    const withExif = splice(base(), exifSegment(6));
    const out = stripExif(withExif);
    expect(Array.from(out)).toEqual(Array.from(base()));
    expect(exifOrientation(out)).toBeNull();
  });
  it('keeps an XMP APP1 and drops only Exif', () => {
    const out = stripExif(splice(base(), xmpSegment(), exifSegment(6)));
    expect(Array.from(out)).toEqual(Array.from(splice(base(), xmpSegment())));
  });
  it('removes every Exif segment', () => {
    const out = stripExif(splice(base(), exifSegment(6), exifSegment(3, false)));
    expect(Array.from(out)).toEqual(Array.from(base()));
  });
  it('returns the same reference when there is nothing to strip', () => {
    const b = base();
    expect(stripExif(b)).toBe(b);
    const x = splice(b, xmpSegment());
    expect(stripExif(x)).toBe(x);
  });
  it('returns the same reference for non-JPEGs and truncated input, never throwing', () => {
    const junk = new Uint8Array([1, 2, 3, 4]);
    expect(stripExif(junk)).toBe(junk);
    const empty = new Uint8Array(0);
    expect(stripExif(empty)).toBe(empty);
    const trunc = splice(base(), exifSegment(6)).subarray(0, 12);
    expect(stripExif(trunc)).toBe(trunc);
  });
  it('leaves everything from SOS on untouched', () => {
    const b = base();
    const sos = b.findIndex((v, i) => v === 0xff && b[i + 1] === 0xda);
    // an Exif-looking APP1 inside scan data must not be removed
    const fake = exifSegment(6);
    const tail = new Uint8Array([...b.subarray(0, sos + 2), 0, 8, ...fake, 0xff, 0x00, 0xff, 0xd9]);
    const input = splice(tail, exifSegment(6));
    const out = stripExif(input);
    expect(Array.from(out)).toEqual(Array.from(tail));
  });
});
