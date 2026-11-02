import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { clampZoom, NOTES_W, ZOOM_MIN, resolveZoom, stepZoom, type ZoomSetting } from '../lib/zoom/fit.ts';
import { pageAnchorAt } from '../lib/zoom/pageAnchor.ts';
import { chromeScale, displayZoom, lampFloor, widestPage } from '../lib/zoom/lamp.ts';
import { panScroll } from '../lib/zoom/pan.ts';
import { commitChanges, zoomCommit } from '../lib/zoom/commit.ts';
import { useBoardScroll } from './useBoardScroll.ts';
import type { PageTurns } from '#editor/geometry/pageTurn.ts';
import { usePageSizes } from './usePageSizes.ts';
import { ACTUAL_SIZE } from '../lib/zoom/percent.ts';
import { usePinchZoom } from './usePinchZoom.ts';
import { useZoomKeys } from './useZoomKeys.ts';
import { useLampAnchor } from './useLampAnchor.ts';
import { useBoardPan } from './useBoardPan.ts';
import type { Point } from '../lib/zoom/anchor.ts';

/** The page under `point` (viewport px) and where on it, from the workspace's page wrappers as they are now. */
function pageAnchorIn(workspace: HTMLElement | null, point: Point) {
  const rects = [...(workspace?.querySelectorAll('[data-page-wrapper]') ?? [])].map((el) => el.getBoundingClientRect());
  return pageAnchorAt(rects, point);
}

interface WorkspaceZoomOptions {
  pdfDocument: PDFDocumentProxy | null;
  /** The element that scrolls sideways, and in fullscreen vertically too. */
  workspaceRef: { current: HTMLElement | null };
  /** The page column the zoom scales. */
  columnRef: { current: HTMLElement | null };
  fullscreen: boolean;
  /** The document has a saved note, so Fit width and Fit text leave room for the notes column (R28). `makeRoom` can lead it. */
  noted?: boolean;
  /** The quarter turns the person gave each page: a turned page swaps width and height, so every fit sizes it as shown. */
  pageTurns?: PageTurns;
}

/**
 * Zoom for the Highlight workspace: the zoom setting (Fit width until changed, never remembered), the zoom it resolves to on this viewport, and the
 * ways to change it. A pinch only scales the column through its ref while the fingers are down and commits
 * once, 150 ms after the last wheel event or when the second finger lifts (the gesture golden rule).
 */
export function useWorkspaceZoom({ pdfDocument, workspaceRef, columnRef, fullscreen, noted = false, pageTurns }: WorkspaceZoomOptions) {
  const [setting, setSetting] = useState<ZoomSetting>('width');
  const pages = usePageSizes(pdfDocument, pageTurns);
  const [view, setView] = useState({ width: 0, height: 0 });
  const ready = pages.length > 0;

  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws) return;
    const measure = () => setView({ width: ws.clientWidth, height: fullscreen ? ws.clientHeight : window.innerHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(ws);
    return () => observer.disconnect();
  }, [workspaceRef, fullscreen, ready]);

  // A note makes room when its card opens, before it is saved; the saved state takes over when it changes.
  const [made, setMade] = useState<boolean | null>(null);
  useLayoutEffect(() => setMade(null), [noted]);
  const roomy = made ?? noted;

  const zoom = useMemo(() => displayZoom(setting, fullscreen, widestPage(pages), view, roomy), [setting, fullscreen, pages, view, roomy]);

  // Entering the lamp always starts at Fit width, whatever was set before; it is not a choice, so nothing is remembered.
  const wasFullscreen = useRef(fullscreen);
  useLayoutEffect(() => {
    if (fullscreen && !wasFullscreen.current) setSetting('width');
    wasFullscreen.current = fullscreen;
  }, [fullscreen]);

  const chromeRef = useRef(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  // The lamp zooms out no further than the whole page (with its notes column) fits.
  const floorRef = useRef(ZOOM_MIN);
  floorRef.current = fullscreen ? lampFloor(widestPage(pages), view, roomy) : ZOOM_MIN;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const viewRef = useRef(view);
  viewRef.current = view;
  const notedRef = useRef(roomy);
  notedRef.current = roomy;
  const settingRef = useRef(setting);
  settingRef.current = setting;
  const fullscreenRef = useRef(fullscreen);
  fullscreenRef.current = fullscreen;

  // Where the page column sits on screen and how far the reader has scrolled, in one frame (viewport pixels).
  const frame = useCallback(() => {
    const ws = workspaceRef.current;
    const col = columnRef.current;
    if (!ws || !col) return null;
    const rect = col.getBoundingClientRect();
    const scroll: Point = { x: ws.scrollLeft, y: fullscreen ? ws.scrollTop : window.scrollY };
    return { rect, scroll, origin: { x: rect.left + scroll.x, y: rect.top + scroll.y } };
  }, [workspaceRef, columnRef, fullscreen]);

  const centre = useCallback((): Point => {
    const r = workspaceRef.current?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: fullscreen ? r.top + r.height / 2 : window.innerHeight / 2 } : { x: 0, y: 0 };
  }, [workspaceRef, fullscreen]);

  // Header, rail and comments keep the normal view's size at the lamp's Fit width and scale with the zoom from there.
  const chrome = chromeScale(zoom, fullscreen, widestPage(pages), view, roomy);
  chromeRef.current = chrome;
  const notesPx = fullscreen && roomy ? NOTES_W * chrome : 0;

  const { pendingScroll, pendingCentre, pendingAnchor, board } = useBoardScroll({ workspaceRef, fullscreen, pages, zoom, setting, view, notesPx });

  const commit = useCallback((next: ZoomSetting, nextZoom: number, anchor?: Point, centreAfter = false, pan?: Point) => {
    if (!commitChanges(settingRef.current, zoomRef.current, next, nextZoom)) return;
    const f = frame();
    if (f) {
      const zoomed = zoomCommit({
        prevZoom: zoomRef.current, nextZoom, anchor: anchor ?? centre(), scroll: f.scroll, origin: f.origin, floor: floorRef.current,
      }).scroll;
      // A two-finger pan carries the pinch's anchor along with the fingers.
      pendingScroll.current = pan ? panScroll(zoomed, pan) : zoomed;
    }
    if (centreAfter) pendingCentre.current = true;
    else if (nextZoom !== zoomRef.current) {
      const point = anchor ?? centre();
      const pageAnchor = pageAnchorIn(workspaceRef.current, point);
      pendingAnchor.current = pageAnchor ? { anchor: pageAnchor, point: pan ? { x: point.x + pan.x, y: point.y + pan.y } : point } : null;
    }
    setSetting(next);
  }, [frame, centre, workspaceRef, pendingAnchor, pendingCentre, pendingScroll]);

  const apply = useCallback((next: ZoomSetting, anchor?: Point) => {
    const target = typeof next === 'number'
      ? clampZoom(next, floorRef.current)
      : pagesRef.current.length ? resolveZoom(next, widestPage(pagesRef.current)!, viewRef.current, { noted: notedRef.current, notesIn: 'px' }) : zoomRef.current;
    commit(next, target, anchor, typeof next !== 'number');
  }, [commit]);
  const step = useCallback((dir: 1 | -1, anchor?: Point) => {
    const target = stepZoom(zoomRef.current, dir, floorRef.current);
    commit(target, target, anchor);
  }, [commit]);
  const actual = useCallback((anchor?: Point) => commit(ACTUAL_SIZE, ACTUAL_SIZE, anchor), [commit]);

  /**
   * The first note opens (or the last one goes): the page fits with or without the notes column in the same
   * layout pass, no transition, and the scroll keeps `point` (the passage on screen, viewport px) on the same line.
   * It is anchored to its page, since headers and gaps do not scale, and only vertically: the page keeps its left
   * edge. It never re-centres and is not a zoom choice.
   */
  const makeRoom = useCallback((nextNoted: boolean, point: Point) => {
    const page = widestPage(pagesRef.current);
    if (page && nextNoted !== notedRef.current) {
      const nextZoom = displayZoom(settingRef.current, fullscreenRef.current, page, viewRef.current, nextNoted);
      const nextChrome = chromeScale(nextZoom, fullscreenRef.current, page, viewRef.current, nextNoted);
      if (nextZoom !== zoomRef.current || nextChrome !== chromeRef.current) {
        const anchor = pageAnchorIn(workspaceRef.current, point);
        pendingScroll.current = null;
        pendingAnchor.current = anchor ? { anchor, point, lineOnly: true } : null;
      }
    }
    setMade(nextNoted);
  }, [workspaceRef, pendingScroll, pendingAnchor]);

  useZoomKeys({ enabled: ready, inLamp: fullscreen, step, actual });
  useBoardPan({ workspaceRef, fullscreen, enabled: ready && fullscreen });
  usePinchZoom({ workspaceRef, columnRef, enabled: ready, inLamp: fullscreen, zoomRef, floorRef, commit });
  useLampAnchor({ workspaceRef, fullscreen });

  /** A document just opened: Fit width, centred. */
  const reset = useCallback(() => {
    setSetting('width');
    setMade(null);
    pendingCentre.current = true;
  }, []);

  return { setting, zoom, chrome, notesPx, pages, board, apply, step, actual, makeRoom, reset };
}

export type WorkspaceZoom = ReturnType<typeof useWorkspaceZoom>;
