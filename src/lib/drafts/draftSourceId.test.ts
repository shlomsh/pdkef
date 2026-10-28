import { describe, expect, it } from 'vitest';
import { sourceIdForBytes, sourceIdForFiles } from './draftSourceId.ts';

const EMPTY_SHA256 = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('sourceIdForBytes', () => {
  it('addresses an ArrayBuffer by its SHA-256 digest', async () => {
    expect(await sourceIdForBytes(new ArrayBuffer(0))).toBe(EMPTY_SHA256);
  });

  it('returns null for anything that is not an ArrayBuffer', async () => {
    expect(await sourceIdForBytes(new Uint8Array(4))).toBeNull();
    expect(await sourceIdForBytes(undefined)).toBeNull();
  });
});

describe('sourceIdForFiles', () => {
  const a = { fileBytes: new Uint8Array([1]).buffer };
  const b = { fileBytes: new Uint8Array([2]).buffer };

  it('is stable for the same ordered files and sensitive to order', async () => {
    const ab = await sourceIdForFiles([a, b]);
    expect(ab).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await sourceIdForFiles([a, b])).toBe(ab);
    expect(await sourceIdForFiles([b, a])).not.toBe(ab);
  });

  it('returns null when any file has no addressable bytes', async () => {
    expect(await sourceIdForFiles([a, { fileBytes: 'nope' }])).toBeNull();
    expect(await sourceIdForFiles([null])).toBeNull();
  });
});
