// The live camera (SCAN-08): the stream, the frame loop, the worker that observes each frame, the capture
// machine, and the shot. DOM plumbing around the pure modules in lib/capture and viewfinderModel.ts.
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { reportError } from '#lib/telemetry/errorReport.ts';
import type { Quad } from '../lib/quad.ts';
import { INITIAL_CAPTURE_STATE, markTaken, searchAgain, stepCapture } from '../lib/capture/captureMachine.ts';
import type { CaptureState, FrameObservation } from '../lib/capture/types.ts';
import { cameraStatusFor } from '../lib/camera/cameraErrors.ts';
import { attachStream, cameraPacer, openCamera, stopCamera, takePhoto } from '../lib/camera/cameraStream.ts';
import { frameGrabber, snapshot } from '../lib/camera/frameGrab.ts';
import { IDLE_VIEW, type CameraHandle, type CameraStatus, type TakenPage } from '../lib/camera/types.ts';
import { liveView } from '../lib/camera/viewfinderModel.ts';

interface UseCameraInput {
  /** Called once per page taken, auto or by the shutter. */
  onTaken: (page: TakenPage) => void;
  /** While true the machine keeps following the page but auto does not shoot; the shutter still works. */
  paused?: boolean;
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

export function useCamera(input: UseCameraInput): CameraHandle {
  const [status, setStatus] = useState<CameraStatus>('starting');
  const [live, setLive] = useState(IDLE_VIEW);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [auto, setAutoState] = useState(true);

  const onTakenRef = useRef(input.onTaken);
  onTakenRef.current = input.onTaken;
  const pausedRef = useRef(input.paused ?? false);
  pausedRef.current = input.paused ?? false;
  const autoRef = useRef(true);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stateRef = useRef<CaptureState>(INITIAL_CAPTURE_STATE);
  const lastObs = useRef<FrameObservation | null>(null);
  const shooting = useRef(false);
  const pacer = useRef<ReturnType<typeof cameraPacer> | null>(null);

  const attach = useCallback(() => attachStream(videoEl.current, streamRef.current), []);
  const track = useCallback(() => streamRef.current?.getVideoTracks()[0], []);

  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    videoEl.current = el;
    if (!el) return;
    const measure = () => setVideoSize({ width: el.videoWidth, height: el.videoHeight });
    el.onloadedmetadata = measure;
    // a rotated phone swaps the intrinsic size without a new loadedmetadata
    el.onresize = measure;
    attach();
  }, [attach]);

  const shoot = useCallback(async (quad?: Quad | null, byShutter = false) => {
    const video = videoEl.current;
    const running = track();
    if (!video || !running || shooting.current) return;
    shooting.current = true;
    pacer.current?.stop();
    try {
      const taken = quad === undefined ? stateRef.current.smoothed : quad;
      if (byShutter && lastObs.current) stateRef.current = markTaken(stateRef.current, lastObs.current.hash);
      onTakenRef.current({ ...(await captureShot(running, video)), quad: taken });
    } catch (err) {
      reportError('pdf_tool_run', err, 'scan_camera_photo');
    } finally {
      shooting.current = false;
    }
  }, []);
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
      const before = stateRef.current;
      const step = stepCapture(before, obs);
      const shoots = step.capture !== null && autoRef.current && !pausedRef.current;
      // a shot auto would have taken while off or paused waits for the page to change, but is not a page taken
      stateRef.current = step.capture && !shoots ? { ...step.state, takenHashes: before.takenHashes } : step.state;
      lastObs.current = obs;
      setLive(liveView(step.state, obs.t));
      pacer.current?.check(obs.t, pausedRef.current);
      if (shoots) void shootRef.current(step.capture); // reason: shoot reports its own failure
    };

    worker.onerror = (event) => {
      event.preventDefault();
      inFlight = false;
      reportError('pdf_tool_run', event.error ?? new Error(event.message), 'scan_camera_observe');
    };

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const video = videoEl.current;
      if (inFlight || !video || !streamRef.current || video.readyState < 2) return;
      const grabbed = grabFrame(video, performance.now());
      if (!grabbed) return;
      inFlight = true;
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
        // a restart (the tab hidden and back) keeps the pages taken: the session is the viewfinder being open
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

  return { status, live, videoSize, videoRef, auto, setAuto, shoot: shutter, track };
}
