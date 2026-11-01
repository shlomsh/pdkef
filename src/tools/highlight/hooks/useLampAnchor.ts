import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { pageAnchorAt, scrollDelta, type PageAnchor } from '../lib/zoom/pageAnchor.ts';

/** The middle of what the reader sees: the workspace in the lamp, the window in the normal view. */
function viewCentre(ws: HTMLElement, inLamp: boolean) {
  const r = ws.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: inLamp ? r.top + r.height / 2 : window.innerHeight / 2 };
}

/**
 * Entering or leaving the lamp changes the zoom and the scroller, so the page point at the middle of the view
 * is remembered (on scroll, never per frame) and put back at the middle once the other view has laid out.
 */
export function useLampAnchor({ workspaceRef, fullscreen }: { workspaceRef: { current: HTMLElement | null }; fullscreen: boolean }) {
  const latest = useRef<PageAnchor | null>(null);
  const was = useRef(fullscreen);

  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws) return;
    const target: HTMLElement | Window = fullscreen ? ws : window;
    let frame = 0;
    const record = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rects = [...ws.querySelectorAll('[data-page-wrapper]')].map((el) => el.getBoundingClientRect());
        latest.current = pageAnchorAt(rects, viewCentre(ws, fullscreen));
      });
    };
    record();
    target.addEventListener('scroll', record, { passive: true });
    return () => { cancelAnimationFrame(frame); target.removeEventListener('scroll', record); };
  }, [workspaceRef, fullscreen]);

  // After the board's own layout effect (declared earlier in the zoom hook), so a centred entry keeps its x.
  useLayoutEffect(() => {
    const ws = workspaceRef.current;
    if (!ws || was.current === fullscreen) return;
    was.current = fullscreen;
    const anchor = latest.current;
    const after = anchor && ws.querySelectorAll('[data-page-wrapper]')[anchor.pageIndex]?.getBoundingClientRect();
    if (!anchor || !after) return;
    const { dy } = scrollDelta(anchor, after, viewCentre(ws, fullscreen));
    if (fullscreen) ws.scrollTop += dy;
    else {
      ws.scrollLeft = 0;
      window.scrollBy(0, dy);
    }
  }, [workspaceRef, fullscreen]);
}
