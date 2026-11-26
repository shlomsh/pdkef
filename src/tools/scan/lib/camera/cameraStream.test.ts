import { describe, expect, it, vi } from 'vitest';
import { cameraPacer, openCamera, stopCamera, stopCameraAfter } from './cameraStream.ts';

describe('openCamera', () => {
  it('throws a TypeError when navigator.mediaDevices is missing', () => {
    // Node's navigator is the real thing here and has no mediaDevices, as on an insecure page.
    expect(navigator.mediaDevices).toBeUndefined();
    expect(() => openCamera()).toThrow(new TypeError('navigator.mediaDevices is not available'));
  });
});

describe('cameraPacer', () => {
  const slowChecks = (pacer: ReturnType<typeof cameraPacer>, from: number, count: number) => {
    for (let i = 0; i < count; i += 1) pacer.check(from + i * 500);
  };

  it('steps a slow phone down and keeps the zoom it had', () => {
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: Chromium's fake camera has no zoom capability and refuses a zoom constraint
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = { applyConstraints, getConstraints: () => ({ advanced: [{ zoom: 2 }] }) } as unknown as MediaStreamTrack;
    slowChecks(cameraPacer(() => track, vi.fn()), 0, 5);
    expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 2 }], width: { ideal: 2592 }, height: { ideal: 1944 } });
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

describe('the camera closing while a photo is taken', () => {
  const stream = () => {
    const stopped = { count: 0 };
    return { stopped, stream: { getTracks: () => [{ stop: () => { stopped.count += 1; } }] } as unknown as MediaStream };
  };

  it('waits for the photo, and the page lands', async () => {
    const { stopped, stream: camera } = stream();
    const photo = Promise.withResolvers<void>();
    stopCameraAfter(camera, photo.promise);
    expect(stopped.count).toBe(0);
    photo.resolve();
    await photo.promise;
    await Promise.resolve();
    expect(stopped.count).toBe(1);
  });

  it('waits no longer than three seconds', async () => {
    const { stopped, stream: camera } = stream();
    vi.useFakeTimers();
    try {
      stopCameraAfter(camera, new Promise(() => {}));
      await vi.advanceTimersByTimeAsync(2900);
      expect(stopped.count).toBe(0);
      await vi.advanceTimersByTimeAsync(200);
      expect(stopped.count).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops at once with no photo under way', () => {
    const { stopped, stream: camera } = stream();
    stopCameraAfter(camera, null);
    expect(stopped.count).toBe(1);
  });
});
