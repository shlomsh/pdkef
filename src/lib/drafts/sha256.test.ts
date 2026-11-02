import { describe, expect, it } from 'vitest';
import { sha256 } from './sha256.ts';

const patterned = (length: number) => Uint8Array.from({ length }, (_, i) => (i * 31 + 7) & 0xff);
// The reference is Web Crypto, which the test runner has and a plain-http page does not.
const expected = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice() as BufferSource));
const text = (s: string) => new TextEncoder().encode(s);

describe('sha256', () => {
  it('matches the known vectors', async () => {
    for (const input of [
      new Uint8Array(0),
      text('abc'),
      text('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    ]) {
      expect(sha256(input)).toEqual(await expected(input));
    }
  });

  it.each([55, 56, 63, 64, 65, 119, 120, 128])('matches Web Crypto at the %i-byte padding boundary', async (length) => {
    const input = patterned(length);
    expect(sha256(input)).toEqual(await expected(input));
  });

  it('matches Web Crypto on a large input', async () => {
    const input = patterned(1_000_003);
    expect(sha256(input)).toEqual(await expected(input));
  });

  it('hashes a view without reading outside it', async () => {
    const view = patterned(200).subarray(10, 150);
    expect(sha256(view)).toEqual(await expected(view));
  });
});
