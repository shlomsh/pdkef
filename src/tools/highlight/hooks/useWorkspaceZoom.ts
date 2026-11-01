import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { readTextItems } from '#lib/pdf/pdfTextItems.ts';
import type { DetailEdits } from '#editor/registry/draftValidation.ts';
import { clampZoom, resolveZoom, stepZoom, type PageBox, type ZoomSetting } from '../lib/zoom/fit.ts';
import { zoomCommit } from '../lib/zoom/commit.ts';
import { initialSetting, serializeSetting } from '../lib/zoom/setting.ts';
import { textBounds } from '../lib/zoom/textBounds.ts';
import { ACTUAL_SIZE } from '../lib/zoom/percent.ts';
import { keyAction } from '../lib/marker/keys.ts';
import type { Point } from '../lib/zoom/anchor.ts';

const STORE_KEY = 'pdkef:highlight:zoom-default';
const PINCH_REST_MS = 150;
/** A trackpad pinch arrives as wheel events with a few pixels of deltaY; this turns them into a smooth factor. */
const WHEEL_PINCH_RATE = 0.01;

function storedDefault(): string | null {
  try { return localStorage.getItem(STORE_KEY); } catch { return null; }
}
function storeDefault(setting: ZoomSetting) {
  try { localStorage.setItem(STORE_KEY, serializeSetting(setting)); } catch { /* storage is optional */ }
}

export interface WorkspaceZoomOptions {
  pdfDocument: PDFDocumentProxy | null;
  /** The element that scrolls sideways, and in fullscreen vertically too. */
  workspaceRef: { current: HTMLElement | null };
  /** The page column the zoom scales. */
  columnRef: { current: HTMLElement | null };
  fullscreen: boolean;
}

/**
 * Zoom for the Highlight workspace: a remembered setting, the zoom it resolves to on this viewport, and the
 * ways to change it. A pinch only scales the column through its ref while the fingers are down and commits
 * once, 150 ms after the last wheel event or when the second finger lifts (the gesture golden rule).
 */
export function useWorkspaceZoom({ pdfDocument, workspaceRef, columnRef, fullscreen }: WorkspaceZoomOptions) {
  const [setting, setSetting] = useState<ZoomSetting>(() => initialSetting(undefined, storedDefault()));
  const [touched, setTouched] = useState(false);
  const [pages, setPages] = useState<PageBox[]>([]);
  const [view, setView] = useState({ width: 0, height: 0 });
  const ready = pages.length > 0;

  // Page sizes for every page, then the first page's text bounds, which the fit modes size the document by.
  useEffect(() => {
    setPages([]);
    if (!pdfDocument) return;
    let live = true;
    void (async () => {
      const boxes: PageBox[] = [];
      for (let n = 1; n <= pdfDocument.numPages; n++) {
        const page = await pdfDocument.getPage(n);
        if (!live) return;
        const { width, height } = page.getViewport({ scale: 1 });
        boxes.push({ width, height, textLeft: 0, textRight: width });
      }
      setPages(boxes);
      const first = await pdfDocument.getPage(1);
      if (!live || first.rotate !== 0) return;
      const { textLeft, textRight } = textBounds(await readTextItems(first), boxes[0].width);
      if (live) setPages(boxes.map((b, i) => (i === 0 ? { ...b, textLeft, textRight } : b)));
    })().catch(() => { /* the page render reports its own failures */ });
    return () => { live = false; };
  }, [pdfDocument]);

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

  const zoom = useMemo(() => {
    if (typeof setting === 'number') return clampZoom(setting);
    if (pages.length === 0 || view.width === 0) return ACTUAL_SIZE;
    return resolveZoom(setting, pages[0], view, { noted: false });
  }, [setting, pages, view]);

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const viewRef = useRef(view);
  viewRef.current = view;

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

  // The scroll that goes with a committed zoom is applied after the layout it belongs to.
  const pendingScroll = useRef<Point | null>(null);
  useLayoutEffect(() => {
    const next = pendingScroll.current;
    const ws = workspaceRef.current;
    if (!next || !ws) return;
    pendingScroll.current = null;
    ws.scrollLeft = next.x;
    if (fullscreen) ws.scrollTop = next.y;
    else window.scrollTo(window.scrollX, next.y);
  });

  const commit = useCallback((next: ZoomSetting, nextZoom: number, anchor?: Point) => {
    const f = frame();
    if (f) {
      pendingScroll.current = zoomCommit({
        prevZoom: zoomRef.current, nextZoom, anchor: anchor ?? centre(), scroll: f.scroll, origin: f.origin,
      }).scroll;
    }
    setSetting(next);
    setTouched(true);
    storeDefault(next);
  }, [frame, centre]);

  const apply = useCallback((next: ZoomSetting, anchor?: Point) => {
    const target = typeof next === 'number'
      ? clampZoom(next)
      : pagesRef.current.length ? resolveZoom(next, pagesRef.current[0], viewRef.current, { noted: false }) : zoomRef.current;
    commit(next, target, anchor);
  }, [commit]);
  const step = useCallback((dir: 1 | -1, anchor?: Point) => {
    const target = stepZoom(zoomRef.current, dir);
    commit(target, target, anchor);
  }, [commit]);
  const actual = useCallback((anchor?: Point) => commit(ACTUAL_SIZE, ACTUAL_SIZE, anchor), [commit]);

  // Keys: mod+= / + / - / 0, anchored at the middle of the viewport.
  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      const action = keyAction(e, { typing, layers: [] });
      if (action?.type === 'zoom') { e.preventDefault(); step(action.dir); }
      else if (action?.type === 'zoomActual') { e.preventDefault(); actual(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ready, step, actual]);

  // Pinch. Everything before the commit touches the DOM through refs only.
  useEffect(() => {
    const ws = workspaceRef.current;
    const col = columnRef.current;
    if (!ws || !col || !ready) return;
    let factor = 1;
    let anchor: Point = { x: 0, y: 0 };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pointers = new Map<number, Point>();
    let startDistance = 0;

    const preview = () => {
      const rect = col.getBoundingClientRect();
      col.style.transformOrigin = `${anchor.x - rect.left}px ${anchor.y - rect.top}px`;
      col.style.transform = `scale(${factor})`;
    };
    const finish = () => {
      clearTimeout(timer);
      if (factor === 1) return;
      const next = clampZoom(zoomRef.current * factor);
      factor = 1;
      // Commit with the column back at its own size, so the frame it measures is the layout one.
      col.style.transform = '';
      col.style.transformOrigin = '';
      commit(next, next, anchor);
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (factor === 1) anchor = { x: e.clientX, y: e.clientY };
      const target = clampZoom(zoomRef.current * factor * Math.exp(-e.deltaY * WHEEL_PINCH_RATE));
      factor = target / zoomRef.current;
      preview();
      clearTimeout(timer);
      timer = setTimeout(finish, PINCH_REST_MS);
    };
    const distance = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        startDistance = distance();
        const [a, b] = [...pointers.values()];
        anchor = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        factor = 1;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size !== 2 || startDistance === 0) return;
      const target = clampZoom(zoomRef.current * (distance() / startDistance));
      factor = target / zoomRef.current;
      preview();
    };
    const onUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size < 2 && startDistance !== 0) { startDistance = 0; finish(); }
    };

    ws.addEventListener('wheel', onWheel, { passive: false });
    col.addEventListener('pointerdown', onDown);
    col.addEventListener('pointermove', onMove);
    col.addEventListener('pointerup', onUp);
    col.addEventListener('pointercancel', onUp);
    return () => {
      clearTimeout(timer);
      ws.removeEventListener('wheel', onWheel);
      col.removeEventListener('pointerdown', onDown);
      col.removeEventListener('pointermove', onMove);
      col.removeEventListener('pointerup', onUp);
      col.removeEventListener('pointercancel', onUp);
      col.style.transform = '';
      col.style.transformOrigin = '';
    };
  }, [workspaceRef, columnRef, ready, commit]);

  /** A document just opened: its own setting beats the remembered default (R25). */
  const restore = useCallback((details: DetailEdits | undefined) => {
    const saved = details?.zoom;
    setSetting(initialSetting(saved?.action === 'alter' ? saved.value : undefined, storedDefault()));
    setTouched(false);
  }, []);

  const details = useMemo<DetailEdits>(() => {
    const edits: DetailEdits = {};
    if (touched) edits.zoom = { action: 'alter', value: serializeSetting(setting) };
    return edits;
  }, [touched, setting]);

  return { setting, zoom, pages, touched, details, apply, step, actual, restore };
}

export type WorkspaceZoom = ReturnType<typeof useWorkspaceZoom>;
