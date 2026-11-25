// SCAN-78: what the running camera does around a photo that fails, or is still being taken when it closes.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameObservation } from '../lib/capture/types.ts';
import { useCamera } from './useCamera.ts';

vi.mock('../lib/camera/frameGrab.ts', () => ({ frameGrabber: () => () => null, snapshot: async () => null })); // forced: jsdom's video has no frames
const camera = vi.hoisted(() => ({ openCamera: vi.fn(), takePhoto: vi.fn() }));
vi.mock('../lib/camera/cameraStream.ts', async (importOriginal) => ({ ...(await importOriginal<object>()), ...camera, attachStream: () => {} })); // forced: jsdom has no camera, and no real one refuses or holds a photo on cue

const track = () => ({ readyState: 'live', stop: vi.fn(function (this: { readyState: string }) { this.readyState = 'ended'; }), addEventListener: vi.fn() });
let running: ReturnType<typeof track>;
let worker: { onmessage: ((e: { data: FrameObservation }) => void) | null };
let handle: ReturnType<typeof useCamera>;
let container: HTMLElement | null;
let now: number;
const onTaken = vi.fn();

const PAGE = { quad: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }], confidence: 1, sharpness: 1000, area: 0.36, hash: '0f0f0f0f0f0f0f0f', focus: 100 };
/** A page held still for `ms`, one check every 100 ms. */
const hold = (ms: number) => act(async () => {
  for (let passed = 0; passed < ms; passed += 100) {
    now += 100;
    worker.onmessage!({ data: { ...PAGE, t: now } as FrameObservation });
    await Promise.resolve();
  }
  await vi.advanceTimersByTimeAsync(0);
});
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const refuse = () => Promise.reject(new DOMException('platform error', 'UnknownError'));
const close = () => act(() => { if (container) render(null, container); container?.remove(); container = null; });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('requestAnimationFrame', () => 1); // Forced: a real frame can fire while the test page is being taken down, where cancelAnimationFrame is already gone
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('Worker', class { onmessage = null; onerror = null; constructor() { worker = this; } postMessage() {} terminate() {} }); // forced: jsdom has no Worker
  now = 0;
  running = track();
  // Forced: no camera in jsdom, a stream with one live track
  camera.openCamera.mockReset().mockImplementation(async () => ({ getVideoTracks: () => [running], getTracks: () => [running] }));
  camera.takePhoto.mockReset();
  onTaken.mockReset();
  container = document.createElement('div');
  function Host() {
    handle = useCamera({ onTaken, scanFiles: [] });
    return null;
  }
  await act(async () => { render(<Host />, container!); });
  await settle();
  act(() => handle.videoRef(document.createElement('video')));
});
afterEach(() => {
  close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a refused photo', () => {
  it('is told, and auto shoots no more until a photo lands', async () => {
    // Forced: takePhoto cannot be refused or held on cue by a real camera here
    camera.takePhoto.mockImplementation(refuse);
    await hold(10_000);
    expect(camera.takePhoto).toHaveBeenCalledTimes(1);
    expect(handle.photoRefused).toBe(true);
    expect(handle.shooting).toBe(false);
  });

  it('leaves the page for the shutter, with no word of turning it', async () => {
    // Forced: takePhoto cannot be refused or held on cue by a real camera here
    camera.takePhoto.mockImplementation(refuse);
    await hold(4000);
    expect(handle.live.hint).toBe('tap');
  });

  it('asked for again by the shutter and refused again is told again, with no automatic shot after it', async () => {
    // Forced: takePhoto cannot be refused or held on cue by a real camera here
    camera.takePhoto.mockImplementation(refuse);
    await hold(4000);
    act(() => handle.shoot());
    expect(handle.photoRefused).toBe(false);
    await settle();
    expect(handle.photoRefused).toBe(true);
    await hold(4000);
    expect(camera.takePhoto).toHaveBeenCalledTimes(2);
  });

  it('that then lands by the shutter lets auto go on', async () => {
    // Forced: takePhoto cannot be refused or held on cue by a real camera here
    camera.takePhoto.mockImplementationOnce(refuse).mockResolvedValue(new Blob(['x']));
    await hold(2000);
    act(() => handle.shoot());
    await settle();
    expect(onTaken).toHaveBeenCalledTimes(1);
    expect(handle.photoRefused).toBe(false);
    PAGE.hash = 'f0f0f0f0f0f0f0f0';
    await hold(4000);
    PAGE.hash = '0f0f0f0f0f0f0f0f';
    expect(camera.takePhoto.mock.calls.length).toBeGreaterThan(2);
  });

  it('lets auto go on once the person turns Auto on again, on the page still in view', async () => {
    // Forced: takePhoto cannot be refused or held on cue by a real camera here
    camera.takePhoto.mockImplementationOnce(refuse).mockResolvedValue(new Blob(['x']));
    await hold(4000);
    act(() => handle.setAuto(false));
    expect(handle.photoRefused).toBe(true);
    act(() => handle.setAuto(true));
    expect(handle.photoRefused).toBe(false);
    await hold(2000);
    expect(onTaken).toHaveBeenCalled();
  });
});

describe('the camera closing while a photo is taken', () => {
  it('waits for the photo, and the page lands', async () => {
    const photo = Promise.withResolvers<Blob>();
    // Forced: takePhoto cannot be refused or held on cue by a real camera here
    camera.takePhoto.mockReturnValue(photo.promise);
    act(() => handle.shoot());
    close();
    expect(running.stop).not.toHaveBeenCalled();
    photo.resolve(new Blob(['x']));
    await settle();
    expect(onTaken).toHaveBeenCalledTimes(1);
    expect(running.stop).toHaveBeenCalledTimes(1);
  });

  it('waits no longer than three seconds', async () => {
    // Forced: takePhoto cannot be refused or held on cue by a real camera here
    camera.takePhoto.mockReturnValue(new Promise(() => {}));
    act(() => handle.shoot());
    close();
    await act(async () => { await vi.advanceTimersByTimeAsync(2900); });
    expect(running.stop).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(running.stop).toHaveBeenCalledTimes(1);
  });

  it('waits when the page is hidden too', async () => {
    const photo = Promise.withResolvers<Blob>();
    // Forced: takePhoto cannot be refused or held on cue by a real camera here
    camera.takePhoto.mockReturnValue(photo.promise);
    act(() => handle.shoot());
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); // forced: a jsdom page is never hidden
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(running.stop).not.toHaveBeenCalled();
    photo.resolve(new Blob(['x']));
    await settle();
    expect(onTaken).toHaveBeenCalledTimes(1);
    expect(running.stop).toHaveBeenCalledTimes(1);
  });

  it('stops at once with no photo under way', () => {
    close();
    expect(running.stop).toHaveBeenCalledTimes(1);
  });
});
