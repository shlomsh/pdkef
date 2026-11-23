import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('openCamera', () => {
  it('asks for the rear camera, no audio', async () => {
    const getUserMedia = vi.spyOn(navigator.mediaDevices, 'getUserMedia');
    const stream = await open();
    expect(stream.getVideoTracks()).toHaveLength(1);
    expect(stream.getAudioTracks()).toHaveLength(0);
    const constraints = getUserMedia.mock.calls[0][0]!;
    expect(constraints.audio).toBe(false);
    expect((constraints.video as MediaTrackConstraints).facingMode).toEqual({ ideal: 'environment' });
  });

  // SCAN-16: on an iPhone takePhoto gives the track's size, so the track has to run at the photo's.
  it('asks for the size that gives a full photo', async () => {
    const getUserMedia = vi.spyOn(navigator.mediaDevices, 'getUserMedia');
    await open();
    const video = getUserMedia.mock.calls[0][0]!.video as MediaTrackConstraints;
    expect(video.width).toEqual({ ideal: 4096 });
    expect(video.height).toEqual({ ideal: 3072 });
  });
});

describe('takePhoto', () => {
  it('returns the blob ImageCapture takes for the track', async () => {
    const stream = await open();
    const blob = await takePhoto(stream.getVideoTracks()[0]);
    expect(blob.type).toMatch(/^image\//);
    const bitmap = await createImageBitmap(blob);
    expect(bitmap.width).toBeGreaterThan(0);
    expect(bitmap.height).toBeGreaterThan(0);
    bitmap.close();
  });
});

describe('cameraPacer', () => {
  const slowChecks = (pacer: ReturnType<typeof cameraPacer>, from: number, count: number) => {
    for (let i = 0; i < count; i += 1) pacer.check(from + i * 500);
  };
  async function track() {
    return (await open()).getVideoTracks()[0];
  }

  it('hands over once the smallest size is too slow', async () => {
    const video = await track();
    const apply = vi.spyOn(video, 'applyConstraints');
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

  // The viewer over the camera busies the main thread: those checks say nothing about the camera.
  it('does not count the time the camera is paused', async () => {
    const video = await track();
    const apply = vi.spyOn(video, 'applyConstraints');
    const pacer = cameraPacer(() => video, vi.fn());
    pacer.check(0);
    for (let t = 500; t < 5000; t += 500) pacer.check(t, true);
    for (let t = 5000; t < 7000; t += 80) pacer.check(t);
    expect(apply).not.toHaveBeenCalled();
  });

  it('judges nothing after a photo, and starts over on reset', async () => {
    const video = await track();
    const apply = vi.spyOn(video, 'applyConstraints');
    const pacer = cameraPacer(() => video, vi.fn());
    pacer.stop();
    slowChecks(pacer, 0, 5);
    expect(apply).not.toHaveBeenCalled();
    pacer.reset();
    slowChecks(pacer, 5000, 5);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
