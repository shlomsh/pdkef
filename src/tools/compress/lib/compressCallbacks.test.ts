import { describe, expect, it, vi } from 'vitest';
import { englishCompressMessages as t } from '../messages';
import { createCompressCallbacks, superseded } from './compressCallbacks.ts';

vi.mock('./compressImage.js', () => ({
  compressImageToTarget: vi.fn(async (file: File) => ({
    blob: new Blob([new Uint8Array(10)], { type: 'image/jpeg' }),
    metTarget: true,
    width: 4,
    height: 3,
    originalWidth: 8,
    originalHeight: 6,
    file,
  })),
}));

function setup(fileName = 'photo.png') {
  const file = new File([new Uint8Array(100)], fileName, { type: 'image/png' });
  const machine = { read: vi.fn(() => ({ runnable: true, runToken: 7 })), send: vi.fn() };
  const compare = { clear: vi.fn(), open: vi.fn(() => Promise.resolve()) };
  const setAnnouncement = vi.fn();
  const callbacks = createCompressCallbacks({
    t,
    machine: machine as never,
    compare: compare as never,
    currentFileRef: { current: file },
    optionsRef: { current: { level: 'medium', targetKB: 5, flatten: false } },
    setAnnouncement: setAnnouncement as never,
  });
  return { file, machine, compare, setAnnouncement, callbacks };
}

describe('superseded', () => {
  it('throws an abort so usePreparedOutput drops the run quietly', () => {
    expect(() => superseded()).toThrow();
    try {
      superseded();
    } catch (err) {
      expect((err as Error).name).toBe('AbortError');
    }
  });
});

describe('createCompressCallbacks', () => {
  it('build starts the machine and returns an image result with its meta', async () => {
    const { callbacks, machine } = setup();
    const progress = vi.fn();
    const built = await callbacks.build(new AbortController().signal, progress);
    expect(machine.send).toHaveBeenCalledWith({ type: 'buildStarted' });
    expect(built.meta?.outputType).toBe('image/jpeg');
    expect(built.meta?.announcement).toBe(t.imageComplete);
    expect(built.meta?.dimensions).toEqual({ width: 4, height: 3, originalWidth: 8, originalHeight: 6 });
  });

  it('build is superseded while the gate is closed', async () => {
    const { callbacks, machine } = setup();
    machine.read.mockReturnValue({ runnable: false, runToken: 7 });
    await expect(callbacks.build(new AbortController().signal, vi.fn())).rejects.toThrow();
    expect(machine.send).not.toHaveBeenCalled();
  });

  it('fail announces the image failure for an image file', () => {
    const { callbacks, setAnnouncement } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    callbacks.fail(new Error('boom'));
    expect(setAnnouncement).toHaveBeenCalledWith(t.imageFailed);
  });

  it('land tells the machine, announces, clears and opens the compare', async () => {
    const { callbacks, machine, compare, setAnnouncement, file } = setup();
    const built = await callbacks.build(new AbortController().signal, vi.fn());
    machine.send.mockClear();
    callbacks.land(built);
    expect(machine.send).toHaveBeenCalledWith({ type: 'buildLanded' });
    expect(setAnnouncement).toHaveBeenCalledWith(t.imageComplete);
    expect(compare.clear).toHaveBeenCalled();
    expect(compare.open).toHaveBeenCalledWith(file, (built as { blob: Blob }).blob);
  });

  it('land skips the compare for a passthrough', () => {
    const { callbacks, compare, setAnnouncement } = setup();
    callbacks.land({ blob: new Blob(), pageCount: 0, meta: { passthrough: true, announcement: 'x' } as never });
    expect(setAnnouncement).toHaveBeenCalledWith('x');
    expect(compare.open).not.toHaveBeenCalled();
  });
});
