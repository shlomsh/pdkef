// The live camera (SCAN-08): the stream, the frame loop, the worker that observes each frame, the capture
// machine, and the shot. DOM plumbing around the pure modules in lib/capture and viewfinderModel.ts.
import { useCallback, useEffect, useRef, useState, type MutableRef } from 'preact/hooks';
import { reportError } from '#lib/telemetry/errorReport.ts';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { INITIAL_CAPTURE_STATE, keepTaken, markTaken, searchAgain, stepCapture } from '../lib/capture/captureMachine.ts';
import { DEFAULT_CAPTURE_PARAMS, type CaptureState, type FrameObservation } from '../lib/capture/types.ts';
import { cameraStatusFor } from '../lib/camera/cameraErrors.ts';
import { attachStream, cameraPacer, openCamera, stopCamera, takePhoto } from '../lib/camera/cameraStream.ts';
import { frameGrabber, snapshot } from '../lib/camera/frameGrab.ts';
import { IDLE_VIEW, type CameraHandle, type Rect, type CameraStatus, type TakenPage } from '../lib/camera/types.ts';
import { nextView, toFrame, WHOLE_FRAME } from '../lib/camera/viewfinderModel.ts';

interface UseCameraInput {
  /** Called once per page taken, auto or by the shutter. */
  onTaken: (page: TakenPage) => void;
  /** While true the machine keeps following the page but auto does not shoot; the shutter still works. */
  paused?: boolean;
  /** The photos that count as taken. */
  scanFiles: readonly File[];
}

/** The full photo and its small copy, taken together. */
async function captureShot(track: MediaStreamTrack, video: HTMLVideoElement) {
  const [photo, small] = await Promise.all([
    takePhoto(track),
    // expected: the small copy is only for the flight into the stack; the photo is still worth keeping
    snapshot(video).catch(() => null),
  ]);
  return { file: new File([photo], `scan-${Date.now()}.jpg`, { type: photo.type || 'image/jpeg' }), snapshot: small };
}

/** A worker that fails on a frame is reported, not surfaced: the next frame tries again. */
function reportObserveFailure(event: ErrorEvent) {
  event.preventDefault();
  reportError('pdf_tool_run', event.error ?? new Error(event.message), 'scan_camera_observe');
}

/** Keeps `setSize` on the video's intrinsic size; a rotated phone swaps it without a new loadedmetadata. */
function watchVideoSize(el: HTMLVideoElement, setSize: (size: { width: number; height: number }) => void) {
  const measure = () => setSize({ width: el.videoWidth, height: el.videoHeight });
  el.onloadedmetadata = measure;
  el.onresize = measure;
}

interface ShotInput {
  videoEl: MutableRef<HTMLVideoElement | null>;
  track: () => MediaStreamTrack | undefined;
  stateRef: MutableRef<CaptureState>;
  lastObs: MutableRef<FrameObservation | null>;
  lastView: MutableRef<Rect>;
  pacer: MutableRef<ReturnType<typeof cameraPacer> | null>;
  onTakenRef: MutableRef<(page: TakenPage) => void>;
  scanFiles: readonly File[];
  paused: boolean;
  setShooting: (on: boolean) => void;
}

/** The shot, one at a time. It notes which page each photo is of, so a photo leaving the scan frees its page. */
function useShot({ videoEl, track, stateRef, lastObs, lastView, pacer, onTakenRef, scanFiles, paused, setShooting }: ShotInput) {
  const shooting = useRef(false);
  const shotHashes = useRef(new WeakMap<File, string>());
  const kept = scanFiles.flatMap((file) => shotHashes.current.get(file) ?? []);

  const keptRef = useRef(kept);
  keptRef.current = kept;
  /** The page of the shot under way, until its photo is among the kept ones (or the shot fails). */
  const pending = useRef<string | null>(null);

  useEffect(() => {
    if (pending.current !== null && kept.includes(pending.current)) pending.current = null;
    restoreUntaken(stateRef, keptRef, pending);
  }, [kept.join(), paused]);

  return useCallback(async (quad?: Quad | null, byShutter = false) => {
    const video = videoEl.current;
    const running = track();
    if (!video || !running || shooting.current) {
      // the machine fired for this frame and remembered its page, but no photo is coming: offer it again,
      // unless it is the page of the shot already under way
      if (quad !== undefined) restoreUntaken(stateRef, keptRef, pending);
      return;
    }
    shooting.current = true;
    setShooting(true);
    pacer.current?.stop();
    try {
      await attemptShot({ stateRef, keptRef, pending, lastObs, lastView, shotHashes: shotHashes.current, onTaken: onTakenRef.current, capture: () => captureShot(running, video), quad, byShutter });
    } finally {
      shooting.current = false;
      setShooting(false);
    }
  }, []);
}

/** A page is remembered as taken once its photo is kept or while its shot is under way: put the machine back to
 * those pages.
 * @testSeam */
export function restoreUntaken(stateRef: MutableRef<CaptureState>, keptRef: MutableRef<readonly string[]>, pending: MutableRef<string | null>) {
  const kept = keptRef.current;
  const inFlight = pending.current;
  stateRef.current = keepTaken(stateRef.current, inFlight !== null && !kept.includes(inFlight) ? [...kept, inFlight] : kept);
}

interface AttemptInput {
  stateRef: MutableRef<CaptureState>;
  keptRef: MutableRef<readonly string[]>;
  pending: MutableRef<string | null>;
  lastObs: MutableRef<FrameObservation | null>;
  lastView: MutableRef<Rect>;
  shotHashes: WeakMap<File, string>;
  onTaken: (page: TakenPage) => void;
  capture: () => Promise<Omit<TakenPage, 'quad'>>;
  quad?: Quad | null;
  byShutter: boolean;
}

/** One shot: mark the page, take the photo, hand it on. A shot that fails leaves its page on offer, not taken.
 * @testSeam */
export async function attemptShot({ stateRef, keptRef, pending, lastObs, lastView, shotHashes, onTaken, capture, quad, byShutter }: AttemptInput) {
  try {
    // a quad handed in is across the whole frame already; the machine's own is across what was on screen
    const { smoothed } = stateRef.current;
    const taken = quad === undefined ? smoothed && toFrame(smoothed, lastView.current) : quad;
    if (byShutter && lastObs.current) stateRef.current = markTaken(stateRef.current, lastObs.current.hash);
    const hash = stateRef.current.lastCaptureHash;
    pending.current = hash;
    const shot = await capture();
    if (hash !== null) shotHashes.set(shot.file, hash);
    onTaken({ ...shot, quad: taken });
  } catch (err) {
    pending.current = null;
    restoreUntaken(stateRef, keptRef, pending);
    reportError('pdf_tool_run', err, 'scan_camera_photo');
  }
}

/** The camera handle, and whether a shot is under way: the page is taken but its photo is not in the scan yet (SCAN-38). */
export function useCamera(input: UseCameraInput): CameraHandle & { shooting: boolean } {
  const [status, setStatus] = useState<CameraStatus>('starting');
  const [live, setLive] = useState(IDLE_VIEW);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [auto, setAutoState] = useState(true);
  const [shooting, setShooting] = useState(false);

  const onTakenRef = useRef(input.onTaken);
  onTakenRef.current = input.onTaken;
  const pausedRef = useRef(input.paused ?? false);
  pausedRef.current = input.paused ?? false;
  const autoRef = useRef(true);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stateRef = useRef<CaptureState>(INITIAL_CAPTURE_STATE);
  const lastObs = useRef<FrameObservation | null>(null);
  // the part of the frame the frame in flight covers (one at a time): stateRef's quad is across it
  const lastView = useRef<Rect>(WHOLE_FRAME);
  const pacer = useRef<ReturnType<typeof cameraPacer> | null>(null);

  const attach = useCallback(() => attachStream(videoEl.current, streamRef.current), []);
  const track = useCallback(() => streamRef.current?.getVideoTracks()[0], []);

  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    videoEl.current = el;
    if (!el) return;
    watchVideoSize(el, setVideoSize);
    attach();
  }, [attach]);

  const shoot = useShot({ videoEl, track, stateRef, lastObs, lastView, pacer, onTakenRef, scanFiles: input.scanFiles, paused: input.paused ?? false, setShooting });
  const shootRef = useRef(shoot);
  shootRef.current = shoot;

  useEffect(() => {
    let alive = true;
    let frame = 0;
    let inFlight = false;
    let starting = false;
    const grabFrame = frameGrabber();
    const worker = new Worker(new URL('../lib/camera/camera.worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (e: MessageEvent<FrameObservation>) => {
      inFlight = false;
      const obs = e.data;
      const step = stepCapture(stateRef.current, obs, DEFAULT_CAPTURE_PARAMS, autoRef.current && !pausedRef.current);
      stateRef.current = step.state;
      lastObs.current = obs;
      const view = lastView.current;
      setLive((previous) => nextView(previous, step.state, obs, view));
      pacer.current?.check(obs.t, pausedRef.current);
      if (step.capture && autoRef.current && !pausedRef.current) void shootRef.current(toFrame(step.capture, view)); // reason: shoot reports its own failure
    };

    worker.onerror = (event) => { inFlight = false; reportObserveFailure(event); };

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const video = videoEl.current;
      if (inFlight || !video || !streamRef.current || video.readyState < 2) return;
      const grabbed = grabFrame(video, performance.now());
      if (!grabbed) return;
      inFlight = true;
      lastView.current = grabbed.view;
      worker.postMessage(grabbed.message, grabbed.transfer);
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (streamRef.current) stopCamera(streamRef.current);
      streamRef.current = null;
      if (videoEl.current) videoEl.current.srcObject = null;
    };

    const handOver = (reason: CameraStatus) => {
      stop();
      setStatus(reason);
    };
    let tooSlow = false;
    pacer.current = cameraPacer(track, () => { tooSlow = true; handOver('slow'); });

    const start = async () => {
      if (starting) return;
      starting = true;
      try {
        const stream = await openCamera();
        if (!alive || document.hidden) { stopCamera(stream); return; }
        if (streamRef.current) stopCamera(streamRef.current);
        streamRef.current = stream;
        // another app took the camera, or the system interrupted it: the photo fallback takes over
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (alive && streamRef.current === stream) handOver('unavailable');
        });
        stateRef.current = searchAgain(stateRef.current);
        pacer.current?.reset();
        inFlight = false;
        setStatus('live');
        attach();
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(tick);
      } catch (err) {
        // expected: a refused or missing camera is a status the viewfinder shows, with the photo fallback
        if (alive) setStatus(cameraStatusFor(err));
      } finally {
        starting = false;
      }
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (!streamRef.current && !tooSlow) void start(); // reason: start turns a failure into a status
    };

    document.addEventListener('visibilitychange', onVisibility);
    void start(); // reason: start turns a failure into a status
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
      worker.terminate();
    };
  }, [attach, track]);

  const setAuto = useCallback((on: boolean) => {
    autoRef.current = on;
    setAutoState(on);
  }, []);
  const shutter = useCallback(() => { void shootRef.current(undefined, true); /* reason: shoot reports its own failure */ }, []);

  return { status, live, videoSize, videoRef, auto, setAuto, shoot: shutter, track, shooting };
}
