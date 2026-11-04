import { afterEach, describe, expect, it, vi } from 'vitest';
import { cameraPacer, openCamera, stopCamera, takePhoto } from './cameraStream.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('openCamera', () => {
  it('asks for the rear camera, no audio', async () => {
    const stream = {} as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    await expect(openCamera()).resolves.toBe(stream);
    const constraints = getUserMedia.mock.calls[0][0];
    expect(constraints.audio).toBe(false);
    expect(constraints.video.facingMode).toEqual({ ideal: 'environment' });
  });

  // SCAN-16: on an iPhone takePhoto gives the track's size, so the track has to run at the photo's.
  it('asks for the size that gives a full photo', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({} as MediaStream);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    await openCamera();
    const { video } = getUserMedia.mock.calls[0][0];
    expect(video.width).toEqual({ ideal: 4096 });
    expect(video.height).toEqual({ ideal: 3072 });
  });

  it('throws a TypeError when navigator.mediaDevices is missing', () => {
    vi.stubGlobal('navigator', {});
    expect(() => openCamera()).toThrow(TypeError);
  });
});

describe('takePhoto', () => {
  it('returns the blob ImageCapture takes for the track', async () => {
    const blob = new Blob(['x']);
    const seen: unknown[] = [];
    class FakeImageCapture {
      constructor(track: unknown) { seen.push(track); }
      takePhoto() { return Promise.resolve(blob); }
    }
    vi.stubGlobal('ImageCapture', FakeImageCapture);
    const track = {} as MediaStreamTrack;
    await expect(takePhoto(track)).resolves.toBe(blob);
    expect(seen).toEqual([track]);
  });
});

describe('cameraPacer', () => {
  const fakeTrack = (applyConstraints = vi.fn().mockResolvedValue(undefined)) => ({
    applyConstraints,
    getConstraints: () => ({ advanced: [{ zoom: 2 }] }),
  }) as unknown as MediaStreamTrack;
  const slowChecks = (pacer: ReturnType<typeof cameraPacer>, from: number, count: number) => {
    for (let i = 0; i < count; i += 1) pacer.check(from + i * 500);
  };

  it('steps a slow phone down and keeps the zoom it had', () => {
    const track = fakeTrack();
    slowChecks(cameraPacer(() => track, vi.fn()), 0, 5);
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 2 }], width: { ideal: 2592 }, height: { ideal: 1944 } });
  });

  it('hands over once the smallest size is too slow', () => {
    const onTooSlow = vi.fn();
    slowChecks(cameraPacer(() => fakeTrack(), onTooSlow), 0, 12);
    expect(onTooSlow).toHaveBeenCalledTimes(1);
  });

  it('keeps the size it has when the track refuses the change', async () => {
    const track = fakeTrack(vi.fn().mockRejectedValue(new Error('no')));
    slowChecks(cameraPacer(() => track, vi.fn()), 0, 5);
    // vitest fails the run on an unhandled rejection, so settling here is the assertion
    await vi.waitFor(() => expect(track.applyConstraints).toHaveBeenCalledTimes(1));
  });

  it('judges nothing after a photo, and starts over on reset', () => {
    const track = fakeTrack();
    const pacer = cameraPacer(() => track, vi.fn());
    pacer.stop();
    slowChecks(pacer, 0, 5);
    expect(track.applyConstraints).not.toHaveBeenCalled();
    pacer.reset();
    slowChecks(pacer, 5000, 5);
    expect(track.applyConstraints).toHaveBeenCalledTimes(1);
  });
});

describe('stopCamera', () => {
  it('stops every track', () => {
    const a = { stop: vi.fn() };
    const b = { stop: vi.fn() };
    stopCamera({ getTracks: () => [a, b] } as unknown as MediaStream);
    expect(a.stop).toHaveBeenCalledTimes(1);
    expect(b.stop).toHaveBeenCalledTimes(1);
  });
});
