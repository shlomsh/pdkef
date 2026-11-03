// The live camera (SCAN-08): the stream, the frame loop, the worker that observes each frame, the capture
// machine, and the shot. DOM plumbing around the pure modules in lib/capture and viewfinderModel.ts.
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { reportError } from '#lib/telemetry/errorReport.ts';
import type { Quad } from '../lib/quad.ts';
import { INITIAL_CAPTURE_STATE, markTaken, stepCapture } from '../lib/capture/captureMachine.ts';
import type { CaptureState, FrameObservation } from '../lib/capture/types.ts';
import { cameraStatusFor } from './cameraErrors.ts';
import { openCamera, stopCamera, takePhoto } from './cameraStream.ts';
import { grabGray, snapshot } from './frameGrab.ts';
import { IDLE_VIEW, type CameraHandle, type CameraStatus, type TakenPage } from './types.ts';
import { liveView } from './viewfinderModel.ts';

export interface UseCameraInput {
  /** Called once per page taken, auto or by the shutter. */
  onTaken: (page: TakenPage) => void;
}

export function useCamera(input: UseCameraInput): CameraHandle {
  const [status, setStatus] = useState<CameraStatus>('starting');
  const [live, setLive] = useState(IDLE_VIEW);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [auto, setAutoState] = useState(true);

  const onTakenRef = useRef(input.onTaken);
  onTakenRef.current = input.onTaken;
  const autoRef = useRef(true);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stateRef = useRef<CaptureState>(INITIAL_CAPTURE_STATE);
  const lastObs = useRef<FrameObservation | null>(null);
  const shooting = useRef(false);

  const attach = useCallback(() => {
    const el = videoEl.current;
    const stream = streamRef.current;
    if (!el || !stream || el.srcObject === stream) return;
    el.srcObject = stream;
    el.muted = true;
    el.playsInline = true;
    el.play().catch(() => {});
  }, []);

  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    videoEl.current = el;
    if (!el) return;
    el.onloadedmetadata = () => setVideoSize({ width: el.videoWidth, height: el.videoHeight });
    attach();
  }, [attach]);

  const shoot = useCallback(async (quad?: Quad | null, byShutter = false) => {
    const video = videoEl.current;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!video || !track || shooting.current) return;
    shooting.current = true;
    try {
      const taken = quad === undefined ? stateRef.current.smoothed : quad;
      if (byShutter && lastObs.current) stateRef.current = markTaken(stateRef.current, lastObs.current.hash);
      const [photo, small] = await Promise.all([takePhoto(track), snapshot(video)]);
      onTakenRef.current({
        file: new File([photo], `scan-${Date.now()}.jpg`, { type: photo.type || 'image/jpeg' }),
        snapshot: small,
        quad: taken,
      });
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
    const canvas = document.createElement('canvas');
    const worker = new Worker(new URL('./camera.worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (e: MessageEvent<FrameObservation>) => {
      inFlight = false;
      const obs = e.data;
      const step = stepCapture(stateRef.current, obs);
      stateRef.current = step.state;
      lastObs.current = obs;
      setLive(liveView(step.state, obs.t));
      if (step.capture && autoRef.current) void shootRef.current(step.capture);
    };

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const video = videoEl.current;
      if (inFlight || !video || !streamRef.current || video.readyState < 2) return;
      const gray = grabGray(video, canvas);
      if (!gray) return;
      inFlight = true;
      const t = performance.now();
      worker.postMessage({ t, width: gray.width, height: gray.height, buffer: gray.data.buffer }, [gray.data.buffer]);
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (streamRef.current) stopCamera(streamRef.current);
      streamRef.current = null;
      if (videoEl.current) videoEl.current.srcObject = null;
    };

    const start = async () => {
      try {
        const stream = await openCamera();
        if (!alive || document.hidden) { stopCamera(stream); return; }
        streamRef.current = stream;
        stateRef.current = INITIAL_CAPTURE_STATE;
        inFlight = false;
        setStatus('live');
        attach();
        frame = requestAnimationFrame(tick);
      } catch (err) {
        if (alive) setStatus(cameraStatusFor(err));
      }
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (!streamRef.current) void start();
    };

    document.addEventListener('visibilitychange', onVisibility);
    void start();
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
      worker.terminate();
    };
  }, [attach]);

  const setAuto = useCallback((on: boolean) => {
    autoRef.current = on;
    setAutoState(on);
  }, []);
  const shutter = useCallback(() => { void shootRef.current(undefined, true); }, []);

  return { status, live, videoSize, videoRef, auto, setAuto, shoot: shutter };
}
