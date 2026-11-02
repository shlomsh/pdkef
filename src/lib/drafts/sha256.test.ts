import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256 } from './sha256.ts';

const patterned = (length: number) => Uint8Array.from({ length }, (_, i) => (i * 31 + 7) & 0xff);
const expected = (bytes: Uint8Array) => new Uint8Array(createHash('sha256').update(bytes).digest());
const text = (s: string) => new TextEncoder().encode(s);

describe('sha256', () => {
  it('matches the known vectors', () => {
    for (const input of [
      new Uint8Array(0),
      text('abc'),
      text('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    ]) {
      expect(sha256(input)).toEqual(expected(input));
    }
  });

  it.each([55, 56, 63, 64, 65, 119, 120, 128])('matches node:crypto at the %i-byte padding boundary', (length) => {
    const input = patterned(length);
    expect(sha256(input)).toEqual(expected(input));
  });

  it('matches node:crypto on a large input', () => {
    const input = patterned(1_000_003);
    expect(sha256(input)).toEqual(expected(input));
  });

  it('hashes a view without reading outside it', () => {
    const view = patterned(200).subarray(10, 150);
    expect(sha256(view)).toEqual(expected(view));
  });
});
