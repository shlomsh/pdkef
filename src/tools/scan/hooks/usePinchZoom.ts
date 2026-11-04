// A pinch on the viewfinder zooms the camera (SCAN-15). The browser never gets the pinch, and where the camera offers
// no zoom nothing else happens. Nothing here passes through state: the fingers go straight to the track.
import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';
import { latestOnly, pinchedZoom, zoomRange, type ZoomCapabilities, type ZoomRange } from '../lib/camera/cameraZoom.ts';

interface Pinch {
  distance: number;
  zoom: number;
  range: ZoomRange;
}

const spread = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

function pinchFrom(track: MediaStreamTrack | undefined, touches: TouchList): Pinch | null {
  if (!track || touches.length !== 2) return null;
  const range = zoomRange(track.getCapabilities?.() as ZoomCapabilities | undefined);
  if (!range) return null;
  const { zoom } = track.getSettings() as { zoom?: number };
  return { distance: spread(touches), zoom: zoom ?? range.min, range };
}

export function usePinchZoom(surface: RefObject<HTMLElement>, track: () => MediaStreamTrack | undefined): void {
  useEffect(() => {
    const el = surface.current;
    if (!el) return undefined;
    let pinch: Pinch | null = null;
    // Everything the track was asked for stays: applyConstraints replaces the lot, and the stream's size is in it.
    const send = latestOnly(async (zoom: number) => {
      const current = track();
      await current?.applyConstraints({ ...current.getConstraints(), advanced: [{ zoom } as MediaTrackConstraintSet] });
    });
    const onStart = (event: TouchEvent) => { pinch = pinchFrom(track(), event.touches); };
    const onMove = (event: TouchEvent) => {
      if (pinch && event.touches.length === 2) send(pinchedZoom(pinch.zoom, pinch.distance, spread(event.touches), pinch.range));
    };
    const onEnd = (event: TouchEvent) => { if (event.touches.length < 2) pinch = null; };
    // iOS: touch-action alone has let a pinch through to the page.
    const keepFromPage = (event: Event) => event.preventDefault();

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    el.addEventListener('gesturestart', keepFromPage);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('gesturestart', keepFromPage);
    };
  }, [surface, track]);
}
