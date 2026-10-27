import { useEffect } from 'preact/hooks';
import { viewportContent, zoomsOnFocus } from '../../lib/fill/viewportZoomLock.ts';

// SNG-17: iOS zooms the page in on any focused field under 16px and never
// zooms back, which leaves the toolbar off screen; in fill mode nearly every
// tap focuses a field. `maximum-scale=1` stops that zoom-on-focus, while iOS
// still honours the person's own pinch (measured 2026-09-26: iOS 26
// Simulator in Safari, and Shlomi's iPhone in Chrome). Fill mode only, at
// runtime, on iOS only, so production's static viewport meta is untouched.
//
// Zoomed in, iOS re-zooms every focused field to its own 16px level, so
// `viewportContent` holds the limits at the person's pinch instead
// (SNG-17). They follow the pinch once it settles: `visualViewport`'s
// 'resize' fires through the gesture, and the meta is rewritten only after
// it goes quiet.
export function useFillViewportLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !zoomsOnFocus(navigator)) return undefined;
    const meta = document.querySelector('meta[name="viewport"]');
    const original = meta?.getAttribute('content') ?? '';
    let pinching = false;
    const apply = () => {
      const next = viewportContent(original, window.visualViewport?.scale ?? 1, pinching);
      if (meta?.getAttribute('content') !== next) meta?.setAttribute('content', next);
    };
    let settle: ReturnType<typeof setTimeout> | undefined;
    const applyWhenSettled = () => {
      clearTimeout(settle);
      settle = setTimeout(apply, 250);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      pinching = true;
      clearTimeout(settle);
      apply();
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!pinching || event.touches.length > 0) return;
      pinching = false;
      applyWhenSettled();
    };
    apply();
    window.visualViewport?.addEventListener('resize', applyWhenSettled);
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: true });
    return () => {
      clearTimeout(settle);
      window.visualViewport?.removeEventListener('resize', applyWhenSettled);
      document.removeEventListener('touchstart', onTouchStart, { capture: true });
      document.removeEventListener('touchend', onTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', onTouchEnd, { capture: true });
      meta?.setAttribute('content', original);
    };
  }, [enabled]);
}
