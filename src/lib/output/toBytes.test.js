import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { toBytes } from './toBytes.js';

describe('toBytes', () => {
  it('returns a Uint8Array as it is', async () => {
    const bytes = new Uint8Array([1, 2]);
    expect(await toBytes(bytes)).toBe(bytes);
  });

  it('wraps an ArrayBuffer and a typed view without copying', async () => {
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
    expect(Array.from(await toBytes(buffer))).toEqual([1, 2, 3, 4]);
    expect(Array.from(await toBytes(new Uint8Array(buffer, 1, 2)))).toEqual([2, 3]);
    expect(Array.from(await toBytes(new DataView(buffer, 2)))).toEqual([3, 4]);
    expect((await toBytes(buffer)).buffer).toBe(buffer);
  });

  it('reads a File and a Blob', async () => {
    expect(Array.from(await toBytes(new File([new Uint8Array([7, 8])], 'a.pdf')))).toEqual([7, 8]);
    expect(Array.from(await toBytes(new Blob([new Uint8Array([9])])))).toEqual([9]);
  });

  it('accepts a buffer made in another realm, where instanceof ArrayBuffer is false', async () => {
    const foreign = vm.runInNewContext('new Uint8Array([5, 6]).buffer');
    expect(foreign instanceof ArrayBuffer).toBe(false);
    expect(Array.from(await toBytes(foreign))).toEqual([5, 6]);
  });

  it('rejects anything else', async () => {
    await expect(toBytes('text')).rejects.toThrow(TypeError);
    await expect(toBytes(null)).rejects.toThrow(TypeError);
  });
});
