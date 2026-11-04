// The zoom a pinch asks of the camera (SCAN-15). Pure: the range on offer, the zoom a pinch reaches, and the queue
// that keeps a pinch from outrunning the camera.

export interface ZoomRange {
  min: number;
  max: number;
  /** 0 when the camera names no step. */
  step: number;
}

/** What getCapabilities says about zoom, where the browser offers it. */
export interface ZoomCapabilities {
  zoom?: { min: number; max: number; step?: number };
}

/** Past this the picture is too shaky to hold still on a page. */
const MOST_ZOOM = 5;

/** The zoom a pinch can reach; null when the camera offers none. */
export function zoomRange(capabilities: ZoomCapabilities | undefined): ZoomRange | null {
  const zoom = capabilities?.zoom;
  if (!zoom || zoom.max <= zoom.min) return null;
  return { min: zoom.min, max: Math.min(zoom.max, zoom.min * MOST_ZOOM), step: zoom.step ?? 0 };
}

/** The zoom a pinch has reached: the zoom it began at, scaled by how far the fingers have spread. */
export function pinchedZoom(startZoom: number, startDistance: number, distance: number, range: ZoomRange): number {
  const wanted = (startZoom * distance) / startDistance;
  const stepped = range.step > 0 ? range.min + Math.round((wanted - range.min) / range.step) * range.step : wanted;
  return Math.min(range.max, Math.max(range.min, stepped));
}

/** Runs one at a time, and of the values that arrive meanwhile only the newest waits its turn. */
export function latestOnly<T>(apply: (value: T) => Promise<unknown>): (value: T) => void {
  let busy = false;
  let waiting: { value: T } | null = null;
  const run = (value: T) => {
    busy = true;
    // expected: a camera that refuses a zoom keeps the one it has, and the next value still goes
    apply(value).catch(() => {}).then(() => {
      busy = false;
      const next = waiting;
      waiting = null;
      if (next) run(next.value);
    });
  };
  return (value) => {
    if (busy) waiting = { value };
    else run(value);
  };
}
