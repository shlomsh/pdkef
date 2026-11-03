import { afterEach, describe, expect, it, vi } from 'vitest';
import { openCamera, stopCamera, takePhoto } from './cameraStream.ts';

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

describe('stopCamera', () => {
  it('stops every track', () => {
    const a = { stop: vi.fn() };
    const b = { stop: vi.fn() };
    stopCamera({ getTracks: () => [a, b] } as unknown as MediaStream);
    expect(a.stop).toHaveBeenCalledTimes(1);
    expect(b.stop).toHaveBeenCalledTimes(1);
  });
});
