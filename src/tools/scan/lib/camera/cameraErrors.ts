// What a failed getUserMedia means for the viewfinder (SCAN-08). Pure.
import type { CameraStatus } from './types.ts';

/** Refused: the person or the page's policy said no. Anything else (no camera, in use, a missing
 * mediaDevices) is unavailable. Both hand over to the native photo input. */
export function cameraStatusFor(error: unknown): Extract<CameraStatus, 'refused' | 'unavailable'> {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'refused' : 'unavailable';
}
