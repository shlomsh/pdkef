import { describe, expect, it } from 'vitest';
import { drainPromises } from './drainPromises.ts';
import { HeldFile } from './heldFile.ts';

const bytes = new Uint8Array([1, 2, 3]);
const settled = async (promise: Promise<unknown>) => {
  let done = false;
  void promise.then(() => { done = true; });
  await drainPromises();
  return done;
};

describe('HeldFile', () => {
  it('a read waits while the file is held, and finishes with the bytes once released', async () => {
    const file = new HeldFile(bytes, 'a.pdf');
    const read = file.arrayBuffer();
    await file.started;
    expect(await settled(read)).toBe(false);
    file.release();
    expect(new Uint8Array(await read)).toEqual(bytes);
  });

  it('a file built not held reads at once', async () => {
    const file = new HeldFile(bytes, 'a.pdf', { held: false });
    expect(await settled(file.arrayBuffer())).toBe(true);
  });

  it('started stays pending until a read is waiting', async () => {
    const file = new HeldFile(bytes, 'a.pdf');
    expect(await settled(file.started)).toBe(false);
    void file.arrayBuffer();
    expect(await settled(file.started)).toBe(true);
  });

  it('hold() after a release holds the next read and renews started', async () => {
    const file = new HeldFile(bytes, 'a.pdf');
    file.release();
    await file.arrayBuffer();
    file.hold();
    expect(await settled(file.started)).toBe(false);
    const read = file.arrayBuffer();
    await file.started;
    expect(await settled(read)).toBe(false);
    file.release();
    expect(new Uint8Array(await read)).toEqual(bytes);
  });

  it('passReads lets that many reads through at once, then holds the next', async () => {
    const file = new HeldFile(bytes, 'a.pdf', { passReads: 2 });
    expect(await settled(file.arrayBuffer())).toBe(true);
    expect(await settled(file.arrayBuffer())).toBe(true);
    const third = file.arrayBuffer();
    await file.started;
    expect(await settled(third)).toBe(false);
    file.release();
    expect(new Uint8Array(await third)).toEqual(bytes);
  });

  it('release lets every waiting read through', async () => {
    const file = new HeldFile(bytes, 'a.pdf');
    const reads = [file.arrayBuffer(), file.arrayBuffer()];
    await file.started;
    file.release();
    expect((await Promise.all(reads)).map((buffer) => buffer.byteLength)).toEqual([3, 3]);
  });
});
