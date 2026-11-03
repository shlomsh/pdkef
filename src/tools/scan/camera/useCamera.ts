// The live camera (SCAN-08): the stream, the frame loop, the worker that observes each frame, the capture
// machine, and the shot. DOM plumbing around the pure modules in lib/capture and viewfinderModel.ts.
import { IDLE_VIEW, type CameraHandle, type TakenPage } from './types.ts';

export interface UseCameraInput {
  /** Called once per page taken, auto or by the shutter. */
  onTaken: (page: TakenPage) => void;
}

export function useCamera(input: UseCameraInput): CameraHandle {
  void input;
  return { status: 'starting', live: IDLE_VIEW, videoSize: { width: 0, height: 0 }, videoRef: () => {}, auto: true, setAuto: () => {}, shoot: () => {} };
}
