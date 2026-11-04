// The camera stream and the photo (SCAN-08). DOM.
import { CAMERA_SIZES, INITIAL_PACE, restartWindow, stepPace, stopJudging } from './cameraPace.ts';

interface ImageCaptureLike { takePhoto(): Promise<Blob> }
declare const ImageCapture: { new (track: MediaStreamTrack): ImageCaptureLike };

export function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new TypeError('navigator.mediaDevices is not available');
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, ...CAMERA_SIZES[0] },
  });
}

/** Plays the stream in the video element, once. */
export function attachStream(el: HTMLVideoElement | null, stream: MediaStream | null): void {
  if (!el || !stream || el.srcObject === stream) return;
  el.srcObject = stream;
  el.muted = true;
  el.playsInline = true;
  // expected: a muted inline video that will not autoplay still delivers frames to the grab
  el.play().catch(() => {});
}

/** The photo. On an iPhone it comes at the track's size (SCAN-16), so the track runs at CAMERA_SIZES. */
export function takePhoto(track: MediaStreamTrack): Promise<Blob> {
  return new ImageCapture(track).takePhoto();
}

/** Watches the checks a running camera finishes and acts on stepPace's verdict; `track` is whatever runs now. */
export function cameraPacer(track: () => MediaStreamTrack | undefined, onTooSlow: () => void) {
  let state = INITIAL_PACE;
  return {
    reset() { state = INITIAL_PACE; },
    stop() { state = stopJudging(state); },
    check(t: number, paused = false) {
      if (paused) { state = restartWindow(state); return; }
      const step = stepPace(state, t);
      state = step.state;
      if (step.verdict === 'tooSlow') onTooSlow();
      if (step.verdict !== 'stepDown') return;
      const running = track();
      // expected: a track that refuses the smaller size keeps its own, and the next window judges that
      running?.applyConstraints({ ...running.getConstraints(), ...CAMERA_SIZES[state.size] }).catch(() => {});
    },
  };
}

export function stopCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
