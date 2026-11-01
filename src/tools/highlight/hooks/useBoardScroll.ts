import { useLayoutEffect, useRef } from 'preact/hooks';
import { boardLayout, centredScrollLeft } from '../lib/zoom/board.ts';
import type { PageBox, ZoomSetting } from '../lib/zoom/fit.ts';
import type { Point } from '../lib/zoom/anchor.ts';
import { scrollDelta, type PageAnchor } from '../lib/zoom/pageAnchor.ts';

/**
 * Where the scroll goes once the layout of a committed zoom is in place. Nothing re-centres on its own: only
 * opening a document, picking a fit mode and a resize under a fit mode do (the page is a board).
 */
export function useBoardScroll({ workspaceRef, fullscreen, pages, zoom, setting, view }: {
  workspaceRef: { current: HTMLElement | null };
  fullscreen: boolean;
  pages: PageBox[];
  zoom: number;
  setting: ZoomSetting;
  view: { width: number; height: number };
}) {
  // What happens to the scroll once the layout of a committed zoom is in place. Nothing re-centres on its
  // own: only opening a document, picking a fit mode and resizing under a fit mode do.
  const pendingScroll = useRef<Point | null>(null);
  const pendingCentre = useRef(true);
  const pendingAnchor = useRef<{ anchor: PageAnchor; point: Point } | null>(null);
  const lastViewWidth = useRef(0);
  const ready = pages.length > 0;
  const widest = pages.reduce((w, p) => Math.max(w, p.width), 0);
  const board = boardLayout(widest * zoom, view.width);
  useLayoutEffect(() => {
    const ws = workspaceRef.current;
    if (!ws) return;
    if (view.width !== lastViewWidth.current) {
      if (lastViewWidth.current !== 0 && typeof setting !== 'number') pendingCentre.current = true;
      lastViewWidth.current = view.width;
    }
    const next = pendingScroll.current;
    const centring = pendingCentre.current;
    if (centring && (!ready || view.width === 0)) return;
    pendingScroll.current = null;
    pendingCentre.current = false;
    if (centring) {
      const page0 = pages[0];
      const offset = page0 ? ((widest - page0.width) * zoom) / 2 : 0;
      const focus = setting === 'text' && page0
        ? { left: offset + page0.textLeft * zoom, right: offset + page0.textRight * zoom }
        : undefined;
      ws.scrollLeft = centredScrollLeft(board, widest * zoom, view.width, focus);
      pendingAnchor.current = null;
    } else if (pendingAnchor.current) {
      // Anchored by page fraction: headers and gaps do not scale, so the whole column cannot be the frame.
      const { anchor, point } = pendingAnchor.current;
      pendingAnchor.current = null;
      const after = ws.querySelectorAll('[data-page-wrapper]')[anchor.pageIndex]?.getBoundingClientRect();
      if (after) {
        const { dx, dy } = scrollDelta(anchor, after, point);
        ws.scrollLeft += dx;
        if (fullscreen) ws.scrollTop += dy;
        else window.scrollBy(0, dy);
        return;
      }
      if (next) ws.scrollLeft = next.x;
    } else if (next) {
      ws.scrollLeft = next.x;
    }
    if (next) {
      if (fullscreen) ws.scrollTop = next.y;
      else window.scrollTo(window.scrollX, next.y);
    }
  });

  return { pendingScroll, pendingCentre, pendingAnchor, board };
}
