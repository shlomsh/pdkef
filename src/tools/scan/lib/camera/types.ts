// The camera in the page (SCAN-08, docs/scan-next.md section 2): the contract between the pure model,
// the camera hook and the viewfinder. Everything here is data; no DOM.
import type { Quad } from '../quad.ts';

/** Which line the viewfinder says: "Point at a page", "Hold still", "Page 3. Turn the page." */
export type Hint = 'point' | 'hold' | 'turn';

/** What the viewfinder draws for the latest analysed frame, derived from the capture state. */
export interface LiveView {
  /** The outline, normalized to the whole video frame; null draws none. */
  quad: Quad | null;
  /** Dashed while finding, solid once locked or holding. */
  locked: boolean;
  /** 0..1, how full the shutter's hold ring is. */
  hold: number;
  hint: Hint;
}

export const IDLE_VIEW: LiveView = { quad: null, locked: false, hold: 0, hint: 'point' };

/** starting: asking for the camera. refused / unavailable: the native photo input takes over. */
export type CameraStatus = 'starting' | 'live' | 'refused' | 'unavailable';

/** One page the camera took. */
export interface TakenPage {
  /** The full photo (ImageCapture.takePhoto), what joins the scan. */
  file: File;
  /** A small copy of the video frame at the shot (long edge about 480 px), for the flight into the stack. */
  /** Null when the small copy could not be made: the page is still taken, only the flight is skipped. */
  snapshot: Blob | null;
  /** The outline at the shot, normalized to the video frame; null when the shutter was pressed with none. */
  quad: Quad | null;
}

/** What useCamera hands the viewfinder. */
export interface CameraHandle {
  status: CameraStatus;
  live: LiveView;
  /** The intrinsic size of the video, 0 until it plays; the outline and the flight map through it. */
  videoSize: { width: number; height: number };
  /** Attach to the <video>. */
  videoRef: (el: HTMLVideoElement | null) => void;
  auto: boolean;
  setAuto: (on: boolean) => void;
  /** The shutter: takes what is in view now, auto or not. */
  shoot: () => void;
}

/** The rectangle, in the box's own pixels, that the whole video frame covers under object-fit: cover.
 * It can be larger than the box and start at negative x or y. */
export interface Rect { x: number; y: number; width: number; height: number }

/** What the island gives the viewfinder. */
export interface ViewfinderProps {
  /** many: keep taking pages until Done. one: the first page taken replaces a page (Retake), then it closes. */
  mode: 'many' | 'one';
  /** Pages in the scan so far: the stack's count and "Page 3." */
  count: number;
  /** The last page as it will download, or its photo while that is being made; null when there is none. */
  lastSrc: string | null;
  /** A page was taken. In mode one the island also closes the viewfinder. */
  onTaken: (file: File) => void;
  /** Done, the close button, Escape: back to the table. The camera stops. */
  onClose: () => void;
  /** The review's Retake: the last page goes and the camera stays. */
  onRetakeLast: () => void;
  /** The review's quiet link: close, and open the last page's corners. */
  onFixCorners: () => void;
  /** Camera refused or unavailable: the photos taken with the native input instead. */
  onFallbackFiles: (files: File[]) => void;
}
