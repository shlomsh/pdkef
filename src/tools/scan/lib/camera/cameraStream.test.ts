import { describe, expect, it, vi } from 'vitest';
import { cameraPacer, openCamera, stopCamera } from './cameraStream.ts';

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
    // Forced: Chromium's fake camera has no zoom capability and refuses a zoom constraint
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
