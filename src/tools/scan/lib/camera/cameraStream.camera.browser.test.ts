import { afterEach, describe, expect, it, vi } from 'vitest';
import { canUseCamera } from './canUseCamera.ts';
import { cameraPacer, openCamera, stopCamera, takePhoto } from './cameraStream.ts';

const opened: MediaStream[] = [];

afterEach(() => {
  for (const stream of opened.splice(0)) stopCamera(stream);
  vi.restoreAllMocks();
});

async function open() {
  const stream = await openCamera();
  opened.push(stream);
  return stream;
}

describe('openCamera and takePhoto', () => {
  // SCAN-16: on an iPhone takePhoto gives the track's size, so the track has to run at the photo's.
  it('asks for the rear camera, no audio, at the size that gives a full photo, and takePhoto returns the blob ImageCapture takes for the track, and the live camera is offered on a touch screen', async () => {
    const getUserMedia = vi.spyOn(navigator.mediaDevices, 'getUserMedia');
    const stream = await open();
    expect(stream.getVideoTracks()).toHaveLength(1);
    expect(stream.getAudioTracks()).toHaveLength(0);
    const constraints = getUserMedia.mock.calls[0][0]!;
    expect(constraints.audio).toBe(false);
    const video = constraints.video as MediaTrackConstraints;
    expect(video.facingMode).toEqual({ ideal: 'environment' });
    expect(video.width).toEqual({ ideal: 4096 });
    expect(video.height).toEqual({ ideal: 3072 });
    const blob = await takePhoto(stream.getVideoTracks()[0]);
    expect(blob.type).toMatch(/^image\//);
    const bitmap = await createImageBitmap(blob);
    expect(bitmap.width).toBeGreaterThan(0);
    expect(bitmap.height).toBeGreaterThan(0);
    bitmap.close();
    expect(canUseCamera(), 'live camera on a touch screen').toBe(true);
  });
});

describe('cameraPacer', () => {
  const slowChecks = (pacer: ReturnType<typeof cameraPacer>, from: number, count: number) => {
    for (let i = 0; i < count; i += 1) pacer.check(from + i * 500);
  };
  async function track() {
    return (await open()).getVideoTracks()[0];
  }

  // The viewer over the camera busies the main thread: those checks say nothing about the camera.
  it('does not count the time the camera is paused, judges nothing after a photo, starts over on reset, and hands over once the smallest size is too slow', async () => {
    const video = await track();
    const apply = vi.spyOn(video, 'applyConstraints');
    const paused = cameraPacer(() => video, vi.fn());
    paused.check(0);
    for (let t = 500; t < 5000; t += 500) paused.check(t, true);
    for (let t = 5000; t < 7000; t += 80) paused.check(t);
    expect(apply, 'paused time').not.toHaveBeenCalled();
    const pacer = cameraPacer(() => video, vi.fn());
    pacer.stop();
    slowChecks(pacer, 0, 5);
    expect(apply, 'after a photo').not.toHaveBeenCalled();
    pacer.reset();
    slowChecks(pacer, 5000, 5);
    expect(apply, 'after a reset').toHaveBeenCalledTimes(1);
    apply.mockClear();
    const onTooSlow = vi.fn();
    slowChecks(cameraPacer(() => video, onTooSlow), 0, 12);
    expect(onTooSlow).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalled();
  });

  it('keeps the size it has when the track refuses the change', async () => {
    const video = await track();
    video.stop();
    const apply = vi.spyOn(video, 'applyConstraints');
    slowChecks(cameraPacer(() => video, vi.fn()), 0, 5);
    // vitest fails the run on an unhandled rejection, so settling here is the assertion
    await Promise.allSettled(apply.mock.results.map((r) => r.value));
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
