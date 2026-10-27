import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentType, JSX, RefObject } from 'preact';
import Sortable from 'sortablejs';
import { Download } from 'lucide-preact';
import styles from './PageGrid.module.css';
import FileName from '../FileName.tsx';
import { movePlanEntry, outputPageCount, rotateEntry, updateEntry, type PlanEntry } from '../../lib/pagePlan.ts';
import { openThumbnailSource } from '../../lib/thumbnails.js';
import { type PageGridMessages } from '../shellMessages';
import { formatMessage } from '../../lib/formatMessage';
import type { PreviewTarget, PreviewToggle, PreviewMessages } from '../PagePreviewDialog.tsx';
import { reportError } from '../../lib/errorReport.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import { CELL_RATIO, MIN_CELL, useStageFit } from './useStageFit.ts';
import { FIT_PATIENCE_MS, fitSettled, rasterWidthForItem, type FitItem } from './stageFit.ts';

export interface GridSource {
  id: number;
  file: File;
  pageCount: number | null;
  error: 'encrypted' | 'unreadable' | null;
}

/** A fourth control in a cell's cluster: a link that saves something for that one page. */
export interface CellAction {
  href: string;
  download: string;
  label: string;
  /** The short word in the visible tooltip. */
  tip: string;
  /** Called on click, after the cell is kept out of it; the browser still downloads. */
  onActivate?: () => void;
}

type Box = { left: number; right: number; width: number };

/** Which grid edge a cell's cluster should stay inside: a cell with no room for
 * another beside it on that side is in the first or last column of its row,
 * whatever the column count. Logical, so a right-to-left grid mirrors it. */
export function cellEdge(cell: Box, grid: Box, rtl = false): 'start' | 'end' | null {
  const room = cell.width / 2;
  if (cell.left - grid.left < room) return rtl ? 'end' : 'start';
  if (grid.right - cell.right < room) return rtl ? 'start' : 'end';
  return null;
}

export interface PageGridProps {
  sources: GridSource[];
  plan: PlanEntry[];
  /** Commits a plan update, exactly once per gesture (drop, key press, tap).
   * An updater over the current plan, not a value, so two commits in one
   * frame (R then Delete on a key repeat) compose instead of the second
   * overwriting the first. */
  onPlanChange: (update: (current: PlanEntry[]) => PlanEntry[]) => void;
  announce: (message: string) => void;
  messages: PageGridMessages;
  /** The id of the heading that names the document the pages belong to. */
  labelledBy: string;
  /** Whether every file's pages still sit in one contiguous run
   * (mergePlan.isGrouped) - captions render only while this holds; once a
   * page crosses a file boundary the per-page tag dot takes over. */
  grouped: boolean;
  /** Whether the grid names each page's file: captions, cell tags, the colour
   * band and the tag dot. Merge passes true. When false none render, and
   * `grouped` is ignored. */
  labelSources: boolean;
  /** The parent's drag-over listener paints the MERGE-10 insertion line on
   * this element, so it owns the ref. */
  gridRef: RefObject<HTMLUListElement>;
  /** Direction A: how many thumbnails have rendered, for the document
   * heading ("18 pages, 16 rendered") and the Download element's preparing
   * detail. Fired whenever the count changes, not on every render. */
  onRenderedCountChange?: (count: number) => void;
  /** Direction A wave 2 (Shlomi): fired the first time a page cell receives
   * keyboard focus (Tab, not a pointer click), so the parent can show the
   * shortcuts line once, briefly, instead of it sitting in the header
   * permanently. May fire more than once across the mount; the parent is
   * the one that only acts on the first call. */
  onFirstKeyboardFocus?: () => void;
  /** Whether pages can be dragged or moved with the arrow keys. Split and PDF
   * to Image keep source order and pass false: no Sortable, no move keys.
   * Rotate, skip, preview and the tap-to-select behave as before. */
  reorderable?: boolean;
  /** An action for one cell, or null for none (PDF to Image: save this page's image). */
  cellAction?: (entry: PlanEntry) => CellAction | null;
}

interface ThumbnailSource {
  pageCount: number;
  /** Every page's width / height, read without rendering. */
  aspects?: () => Promise<number[]>;
  render: (pageIndex: number, opts: { width?: number; type?: string; quality?: number; signal?: AbortSignal }) => Promise<string>;
  destroy: () => Promise<void>;
}

/* MERGE-08's budget: 150 px PNG on desktop (15 to 25 KB a page), 96 px JPEG
   at 0.7 under 768 px (2 to 3 KB), so a 400-page set stays under 10 MB of
   data URLs on desktop and around 1 MB on a phone. Only pages near the
   viewport render (an IntersectionObserver over the document's own scroll,
   since the grid no longer scrolls itself - root: null), one at a time,
   yielding between pages. */
/* How far past the viewport a page is rendered ahead: the observer's root
   margin and the visible scan's reach, so the two can never disagree. */
const NEAR_VIEWPORT_PX = 400;

function isPhoneViewport(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 767px)').matches;
}

/* Phone: 96 px JPEG. Tablet: the fixed 150 px PNG. Desktop (MERGE-24): the
   raster follows the fitted cell width, in steps (stageFit.rasterWidthFor).
   The memory note: a bigger raster only happens when few pages are on
   screen, because the cell only grows when there are few - a 400-page set
   stays at the 104px floor, where the raster stays at the 150 px budget above
   whatever the screen density (rasterWidthFor). */
function thumbnailOptions(desktopCell: number | null, span: 1 | 2 = 1) {
  if (isPhoneViewport()) return { width: 96, type: 'image/jpeg', quality: 0.7 };
  if (desktopCell == null) return { width: 150, type: 'image/png' };
  return { width: rasterWidthForItem(desktopCell, span, 12, window.devicePixelRatio || 1), type: 'image/png' };
}

/* Shlomi's follow-up (2026-09-13), item 1: one continuous CSS grid now
   (`grid-template-columns: repeat(auto-fill, <cell>px)`), so every
   thumbnail - across every file - lines up to the same column grid. Desktop
   keeps its 104px portrait cell (3:4 box, unchanged since wave 2); the phone
   cell shrinks from 96px to 72px (same 3:4 box: 72 x 96) so four columns fit
   the 319px card content width with 8px gaps (4*72 + 3*8 = 312). The
   thumbnail itself still rasterises at 96px on a phone (thumbnailOptions
   above) and simply downscales into the smaller box. MERGE-24: on a desktop
   viewport the cell instead takes the width useStageFit fits to the stage
   (same 104:138 box, scaled); tablet keeps 104 x 138. */
function baseCellSize(desktopCell: number | null): { w: number; h: number } {
  if (isPhoneViewport()) return { w: 72, h: 96 };
  if (desktopCell == null) return { w: MIN_CELL, h: 138 };
  return { w: desktopCell, h: Math.round(desktopCell / CELL_RATIO) };
}

/* The grid's own column track width and gap - one pair of values for the
   whole grid, read once per render from the same viewport check every
   per-item cell size already uses. */
function gridMetrics(desktopCell: number | null): { cell: number; gap: number } {
  if (isPhoneViewport()) return { cell: 72, gap: 8 };
  return { cell: desktopCell ?? MIN_CELL, gap: 12 };
}

function isDesktopViewport(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(min-width: 1024px)').matches;
}

/* Whether a page shows landscape once rotated: the grid columns it takes
   (2, else 1) feed useStageFit. Same rule as the cell markup's own. */
function spansTwo(rotation: number, aspect: number | undefined): boolean {
  const sourceLandscape = aspect != null && aspect >= 1;
  return (rotation === 90 || rotation === 270) ? !sourceLandscape : sourceLandscape;
}

/* The grid items useStageFit packs into rows: each page's span, and a row
   break before the first page of a captioned run (grouped, 4 or more pages;
   the same rule the cell markup uses for the caption row). */
function fitItems(plan: PageGridProps['plan'], aspects: Map<string, number>, grouped: boolean): FitItem[] {
  return plan.map((entry, index) => {
    const startsRun = index === 0 || plan[index - 1].fileId !== entry.fileId;
    let runLength = 0;
    if (grouped && startsRun) {
      for (let i = index; i < plan.length && plan[i].fileId === entry.fileId; i += 1) runLength += 1;
    }
    return {
      span: spansTwo(entry.rotation, aspects.get(entry.key)) ? 2 : 1,
      breakBefore: runLength >= 4,
    };
  });
}

/* MERGE-24 (2026-10-24): true once the grid may show (data-fit-settled), at
   every width: a landscape page lays out in one column until its aspect
   arrives, then spans two, which shifted pages 3 and 4 on phone and tablet.
   Settled for good: later changes come from the person's own actions. */
function useFitSettled(known: number, total: number, measured: boolean, probing: boolean): boolean {
  const [settled, setSettled] = useState(false);
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    if (settled || total <= 0) return undefined;
    if (startedAt.current == null) startedAt.current = Date.now();
    const elapsed = Date.now() - startedAt.current;
    if (fitSettled({ known, total, elapsed, measured, probing })) {
      setSettled(true);
      return undefined;
    }
    const timer = setTimeout(() => setSettled(true), Math.max(0, FIT_PATIENCE_MS - elapsed));
    return () => clearTimeout(timer);
  }, [settled, known, total, measured, probing]);
  return settled;
}

export default function PageGrid({
  sources: entries,
  plan,
  onPlanChange,
  announce,
  messages: t,
  labelledBy,
  grouped,
  labelSources,
  gridRef,
  onRenderedCountChange,
  onFirstKeyboardFocus,
  reorderable = true,
  cellAction,
}: PageGridProps) {
  // A plain keyboard/pointer heuristic (not :focus-visible, which some jsdom
  // versions don't implement): a keydown anywhere sets "keyboard modality"
  // until the next pointer interaction clears it, mirroring how most
  // focus-visible polyfills work.
  const keyboardActiveRef = useRef(false);
  useEffect(() => {
    const setKeyboard = () => { keyboardActiveRef.current = true; };
    const clearKeyboard = () => { keyboardActiveRef.current = false; };
    window.addEventListener('keydown', setKeyboard, true);
    window.addEventListener('mousedown', clearKeyboard, true);
    window.addEventListener('pointerdown', clearKeyboard, true);
    return () => {
      window.removeEventListener('keydown', setKeyboard, true);
      window.removeEventListener('mousedown', clearKeyboard, true);
      window.removeEventListener('pointerdown', clearKeyboard, true);
    };
  }, []);
  const [, bump] = useState(0);
  const thumbnails = useRef(new Map<string, string>());
  const aspects = useRef(new Map<string, number>());
  const probed = useRef(new Set<number>());
  // Files whose page-size read is still running.
  const probing = useRef(0);
  // The raster width each cached thumbnail was rendered at, so a page re-renders
  // at a larger step when its cell grows and never at a smaller one.
  const planRef = useRef(plan);
  planRef.current = plan;
  const rasterWidths = useRef(new Map<string, number>());
  // Without source labels there are no runs to caption or tag.
  const labelled = labelSources && grouped;
  const fitList = fitItems(plan, aspects.current, labelled);
  const desktopCell = useStageFit(gridRef, fitList);
  const spanSignature = fitList.map((item) => item.span).join('');
  // On desktop, wait for the first fitted cell so a page is never rendered twice.
  const fitPending = desktopCell == null && isDesktopViewport();
  const fitSettledNow = useFitSettled(
    plan.reduce((count, entry) => count + (aspects.current.has(entry.key) ? 1 : 0), 0),
    plan.length,
    // Phone and tablet cells are fixed, so only desktop has a cell to measure.
    desktopCell != null || !isDesktopViewport(),
    entries.some((e) => !e.error && !probed.current.has(e.id)) || probing.current > 0,
  );
  const fitPendingRef = useRef(fitPending);
  fitPendingRef.current = fitPending;
  const optionsRef = useRef(thumbnailOptions(desktopCell));
  optionsRef.current = thumbnailOptions(desktopCell);
  // Each page's own raster options: a landscape page is two cells wide.
  const desktopCellRef = useRef(desktopCell);
  desktopCellRef.current = desktopCell;
  const optionsFor = useCallback((key: string) => {
    const entry = planRef.current.find((e) => e.key === key);
    const span = entry && spansTwo(entry.rotation, aspects.current.get(key)) ? 2 : 1;
    return thumbnailOptions(desktopCellRef.current, span);
  }, []);
  // A cached thumbnail counts only if it is at least as sharp as the current cell wants.
  const hasCurrent = useCallback((key: string) => thumbnails.current.has(key)
    && (rasterWidths.current.get(key) ?? 0) >= optionsFor(key).width, [optionsFor]);
  const sources = useRef(new Map<number, { source: Promise<ThumbnailSource>; controller: AbortController }>());
  const queue = useRef<string[]>([]);
  const queued = useRef(new Set<string>());
  const rendering = useRef(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const focusKey = useRef<string | null>(null);
  // Phone (Shlomi, 2026-09-13): a tap on a page reveals that page's own
  // rotate / skip / open cluster, and only that page's - three 44px buttons
  // cannot share a row of 72px cells, so "Edit pages" (every cluster at
  // once) put each cell's Open under its neighbour's Rotate. Tap the same
  // page again, another page, or anywhere outside the grid to let go.
  // Desktop CSS ignores the attribute (hover and :focus-visible reveal
  // there), so the state is harmless on a pointer device.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedKey) return undefined;
    const grid = gridRef.current;
    const onPointerDown = (event: PointerEvent) => {
      if (grid && !grid.contains(event.target as Node)) setSelectedKey(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [selectedKey, gridRef]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [PreviewDialog, setPreviewDialog] = useState<ComponentType<{
    target: PreviewTarget | null; onClose: () => void; onStep: (delta: 1 | -1) => void;
    toggle?: PreviewToggle; messages: PreviewMessages;
  }> | null>(null);

  const fileById = (id: number) => entriesRef.current.find((e) => e.id === id);

  const releaseFile = useCallback((fileId: number) => {
    probed.current.delete(fileId);
    const held = sources.current.get(fileId);
    if (held) {
      held.controller.abort();
      // expected: best-effort cleanup of a released pdf.js source
      Promise.resolve(held.source).then((s) => s?.destroy()).catch(() => {});
      sources.current.delete(fileId);
    }
    for (const key of Array.from(thumbnails.current.keys())) {
      if (key.startsWith(`${fileId}:`)) { thumbnails.current.delete(key); rasterWidths.current.delete(key); }
    }
    queue.current = queue.current.filter((key) => !key.startsWith(`${fileId}:`));
    for (const key of Array.from(queued.current)) if (key.startsWith(`${fileId}:`)) queued.current.delete(key);
  }, []);

  // Reports the rendered count up to the parent whenever it actually moves -
  // the document heading and the Download element's "N of M rendered" both
  // read it, without either owning the thumbnail cache itself.
  const reportRenderedCount = useCallback(() => {
    if (!onRenderedCountChange) return;
    let count = 0;
    for (const entry of planRef.current) if (thumbnails.current.has(entry.key)) count += 1;
    onRenderedCountChange(count);
  }, [onRenderedCountChange]);

  // One pdf.js document per file, opened the first time a page or an aspect needs it.
  const sourceFor = useCallback((entry: GridSource) => {
    let held = sources.current.get(entry.id);
    if (!held) {
      const controller = new AbortController();
      held = { source: openThumbnailSource(entry.file) as Promise<ThumbnailSource>, controller };
      sources.current.set(entry.id, held);
    }
    return held;
  }, []);

  const processQueue = useCallback(async () => {
    if (rendering.current) return;
    rendering.current = true;
    try {
      while (queue.current.length > 0) {
        const key = queue.current.shift() as string;
        queued.current.delete(key);
        if (hasCurrent(key)) continue;
        const [fileIdText, pageIndexText] = key.split(':');
        const fileId = Number(fileIdText);
        const pageIndex = Number(pageIndexText);
        const entry = fileById(fileId);
        if (!entry || entry.error) continue;
        const held = sourceFor(entry);
        try {
          const source = await held.source;
          if (held.controller.signal.aborted) continue;
          const options = optionsFor(key);
          const dataUrl = await source.render(pageIndex, { ...options, signal: held.controller.signal });
          if (held.controller.signal.aborted) continue;
          thumbnails.current.set(key, dataUrl);
          rasterWidths.current.set(key, options.width);
          bump((n) => n + 1);
          reportRenderedCount();
        } catch (err) {
          reportError('pdf_render', err, 'render_thumbnail');
          // A page that will not render stays a placeholder; the merge itself
          // reports a broken file through inspectPdf, not through here.
        }
        // Yield so a long grid never freezes scrolling.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      rendering.current = false;
    }
  }, [reportRenderedCount, hasCurrent, optionsFor, sourceFor]);

  const enqueue = useCallback((key: string) => {
    if (fitPendingRef.current || hasCurrent(key) || queued.current.has(key)) return;
    queued.current.add(key);
    queue.current.push(key);
    void processQueue();
  }, [processQueue, hasCurrent]);

  /* Page aspects come from the PDF's own page sizes, read for every file, rather
     than from the first thumbnail: a thumbnail that arrives after the fit has
     settled changes a span and refits every cell (DEBT-65, 0.05 of layout
     shift on a throttled run). Photos and unreadable files simply have none. */
  useEffect(() => {
    const pending = entries.filter((e) => !e.error && e.pageCount != null && !probed.current.has(e.id));
    for (const entry of pending) {
      probed.current.add(entry.id);
      probing.current += 1;
      const held = sourceFor(entry);
      void (async () => {
        try {
          const list = await (await held.source).aspects?.();
          if (!list || held.controller.signal.aborted) return;
          list.forEach((aspect, pageIndex) => {
            if (Number.isFinite(aspect) && aspect > 0) aspects.current.set(`${entry.id}:${pageIndex}`, aspect);
          });
        } catch {
          // expected: an unreadable file has no sizes; its thumbnail path reports the error
        } finally {
          probing.current -= 1;
          bump((n) => n + 1);
        }
      })();
    }
  }, [entries, sourceFor]);

  // Release thumbnails and cancel pending renders for files that left the list.
  useEffect(() => {
    const present = new Set(entries.map((e) => e.id));
    for (const fileId of Array.from(sources.current.keys())) if (!present.has(fileId)) releaseFile(fileId);
    for (const key of Array.from(thumbnails.current.keys())) {
      if (!present.has(Number(key.split(':')[0]))) { thumbnails.current.delete(key); rasterWidths.current.delete(key); }
    }
    reportRenderedCount();
  }, [entries, releaseFile, reportRenderedCount]);

  useEffect(() => () => {
    for (const fileId of Array.from(sources.current.keys())) releaseFile(fileId);
    observer.current?.disconnect();
  }, [releaseFile]);

  // Observe every card; render as it nears the viewport. The grid no longer
  // scrolls itself (it wraps in the page's own flow), so the observer root
  // is the viewport, not the grid element.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;
    observer.current?.disconnect();
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        const key = (record.target as HTMLElement).dataset.key;
        if (key) enqueue(key);
      }
    }, { root: null, rootMargin: `${NEAR_VIEWPORT_PX}px 0px ${NEAR_VIEWPORT_PX}px 0px` });
    observer.current = io;
    for (const card of Array.from(grid.querySelectorAll('[data-key]'))) io.observe(card);
    // The observer only reports on a rendering frame, and a hidden document
    // (a background tab, a page opened from a link and left) gets none: the
    // cells in view stayed dashed until something moved. One geometric pass
    // now, and again when the document becomes visible, covers what the
    // observer will not say; it costs one rect read per cell.
    const scanVisible = () => {
      const from = -NEAR_VIEWPORT_PX;
      const to = window.innerHeight + NEAR_VIEWPORT_PX;
      for (const card of Array.from(grid.querySelectorAll<HTMLElement>('[data-key]'))) {
        const rect = card.getBoundingClientRect();
        // A cell with no size has no place on screen yet (jsdom, or a grid
        // still hidden); the observer reports on it once it has one.
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.bottom >= from && rect.top <= to && card.dataset.key) enqueue(card.dataset.key);
      }
    };
    scanVisible();
    const onVisible = () => { if (document.visibilityState === 'visible') scanVisible(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
    };
  // A larger raster step (the cell grew) rescans so visible pages sharpen.
  }, [plan, enqueue, gridRef, optionsRef.current.width, spanSignature, fitPending]);

  // SortableJS owns the DOM during a drag; the plan is committed once in onEnd.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !reorderable) return undefined;
    const clearDraggingCursor = () => document.documentElement.removeAttribute('data-page-dragging');
    const sortable = Sortable.create(grid, {
      animation: 220,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      draggable: `.${styles.page}`,
      filter: `.${styles.caption}, .${styles.action}`,
      preventOnFilter: false,
      // Native HTML drag owns the OS cursor and changes it back to an arrow
      // once the drag image leaves the source card. The fallback path keeps
      // the gesture in pointer events, so our grabbing cursor remains visible
      // throughout the desktop drag and matches the touch implementation.
      forceFallback: true,
      fallbackTolerance: 4,
      // A swipe pans the page; a press-and-hold picks a page up. Without the
      // delay every vertical scroll on a phone would start a drag instead.
      delay: 150,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      ghostClass: styles['is-ghost'],
      chosenClass: styles['is-chosen'],
      dragClass: styles['is-dragging'],
      onStart() {
        document.documentElement.setAttribute('data-page-dragging', '');
      },
      onEnd(evt: Sortable.SortableEvent) {
        clearDraggingCursor();
        if (evt.oldIndex == null || evt.newIndex == null || evt.oldIndex === evt.newIndex) return;
        const { oldIndex, newIndex } = evt;
        onPlanChange((current) => movePlanEntry(current, oldIndex, newIndex));
        recordAction('reorder');
        announce(formatMessage(t.pageMoved, { position: newIndex + 1, total: planRef.current.length }));
      },
    });
    return () => {
      clearDraggingCursor();
      sortable.destroy();
    };
  }, [gridRef, onPlanChange, reorderable]);

  // Keep focus on the page that was just moved by keyboard, even though its
  // node changed position in the DOM.
  useEffect(() => {
    const key = focusKey.current;
    if (!key || !gridRef.current) return;
    // Used once: a later plan change (a field beside the grid, Undo) must not pull focus back.
    focusKey.current = null;
    // Keys are `${fileId}:${pageIndex}`, digits and a colon, safe inside quotes.
    const card = gridRef.current.querySelector<HTMLElement>(`[data-key="${key}"]`);
    if (card && document.activeElement !== card) card.focus({ preventScroll: false });
  }, [plan, gridRef]);

  const rotate = useCallback((key: string, position: number) => {
    onPlanChange((current) => rotateEntry(current, key, 90));
    recordAction('rotate');
    const before = planRef.current.find((p) => p.key === key)?.rotation ?? 0;
    announce(formatMessage(t.pageRotated, { number: position, degrees: (before + 90) % 360 }));
  }, [onPlanChange, announce, t.pageRotated]);

  const toggleSkip = useCallback((key: string, position: number) => {
    const entry = planRef.current.find((p) => p.key === key);
    if (!entry) return;
    onPlanChange((current) => {
      const live = current.find((p) => p.key === key);
      return live ? updateEntry(current, key, { skipped: !live.skipped }) : current;
    });
    recordAction('hide_page');
    announce(formatMessage(entry.skipped ? t.pageIncluded : t.pageSkipped, { number: position }));
  }, [onPlanChange, announce, t.pageIncluded, t.pageSkipped]);

  const move = useCallback((index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= planRef.current.length) return;
    focusKey.current = planRef.current[index].key;
    onPlanChange((current) => movePlanEntry(current, index, target));
    recordAction('reorder');
    announce(formatMessage(t.pageMoved, { position: target + 1, total: planRef.current.length }));
  }, [onPlanChange, announce, t.pageMoved]);

  const openPreview = useCallback((index: number) => {
    setPreviewIndex(index);
    if (!PreviewDialog) {
      import('../PagePreviewDialog.tsx').then((module) => setPreviewDialog(() => module.default)).catch((err) => { reportError('chunk_load', err, 'import_preview_dialog'); });
    }
  }, [PreviewDialog]);

  // Each cell's cluster stays inside the grid at the row's ends. Read from the
  // rendered layout after every render and on every resize, written straight to the
  // DOM (no state), so it never costs a render.
  const markEdges = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const gridBox = grid.getBoundingClientRect();
    const rtl = getComputedStyle(grid).direction === 'rtl';
    const cells = Array.from(grid.querySelectorAll<HTMLElement>('[data-key]'));
    const edges = cells.map((cell) => cellEdge(cell.getBoundingClientRect(), gridBox, rtl));
    cells.forEach((cell, i) => {
      if (edges[i]) cell.dataset.edge = edges[i] as string;
      else delete cell.dataset.edge;
    });
  }, [gridRef]);
  useEffect(markEdges);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(markEdges);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [gridRef, markEdges]);

  const onCardKeyDown = (event: KeyboardEvent, index: number, key: string) => {
    const rtl = typeof getComputedStyle === 'function' && getComputedStyle(event.currentTarget as HTMLElement).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    // Only the card's own keys: on a control inside its cluster a key is that control's.
    if (event.target !== event.currentTarget) return;
    if (reorderable && event.key === forward) {
      event.preventDefault();
      move(index, 1);
    } else if (reorderable && event.key === backward) {
      event.preventDefault();
      move(index, -1);
    } else if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      rotate(key, index + 1);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      toggleSkip(key, index + 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      openPreview(index);
    }
  };

  // Numbers are output positions: what the page will be in the merged file
  // (and what "Add page numbers" would stamp). A skipped page shows the
  // number it would take, struck, so the pages behind it keep the numbers
  // they will really get.
  const outputTotal = outputPageCount(plan);

  // Review P2: the preview dialog's title used to count the raw plan
  // (previewIndex + 1 of plan.length), which disagreed with the heading and
  // every cell's own aria-label - both of which count OUTPUT pages, showing
  // a skipped page as the position it would take. This mirrors that same
  // counter up to `index`, so a skipped page previewed still says "would be
  // page N" and the total always matches the heading's "N pages" figure.
  // Previous/Next stay keyed to the raw plan index (atStart/atEnd) rather
  // than to this position, since a skipped page's position can equal or
  // exceed the output total without it being the last page in the plan.
  const outputPositionAt = (index: number): number => {
    let counter = 0;
    for (let i = 0; i <= index; i += 1) if (!plan[i].skipped) counter += 1;
    return plan[index].skipped ? counter + 1 : counter;
  };

  const previewTarget: PreviewTarget | null = (() => {
    if (previewIndex == null) return null;
    const entry = plan[previewIndex];
    const file = entry ? fileById(entry.fileId) : undefined;
    if (!entry || !file) return null;
    return {
      file: file.file,
      pageIndex: entry.pageIndex,
      rotation: entry.rotation,
      title: formatMessage(t.previewTitle, { number: outputPositionAt(previewIndex), total: outputTotal }),
      badge: entry.skipped ? t.previewSkippedBanner : undefined,
      atStart: previewIndex <= 0,
      atEnd: previewIndex >= plan.length - 1,
    };
  })();

  const filePosition = new Map(entries.map((e, i) => [e.id, i + 1]));
  const gridBase = baseCellSize(desktopCell);
  const { cell: gridCell, gap: gridGap } = gridMetrics(desktopCell);
  let outputCounter = 0;
  const items: JSX.Element[] = [];
  plan.forEach((entry, index) => {
    const file = fileById(entry.fileId);
    if (!file) return;
    if (!entry.skipped) outputCounter += 1;
    const position = entry.skipped ? outputCounter + 1 : outputCounter;

    // Shlomi's follow-up (2026-09-13), item 1: one continuous grid, no row
    // break at a file boundary. A file's label is a compact TAG (colour
    // square + bidi name) inside the reserved strip at the top of its run's
    // first cell - for a run of 1 to 3 pages ONLY. A run of 4 or more pages
    // instead gets a full-width caption row (the old label: tag, name, page
    // range) placed before it, which is what forces a fresh grid row; the
    // caption case renders NO tag in its own first cell (the caption already
    // said whose pages these are). Either way this only happens while the
    // plan is grouped - ungrouped, both give way to the per-page tag dot
    // (always in the DOM, see below).
    let tagForThisCell: { name: string; style: Record<string, string> } | null = null;
    if (labelled && (index === 0 || plan[index - 1].fileId !== entry.fileId)) {
      const runStart = position;
      // Walk the file's own contiguous slice to find its last output
      // position and how many pages (slots, skipped included) the run has.
      let end = runStart;
      let counter = outputCounter - 1;
      let runLength = 0;
      for (let i = index; i < plan.length && plan[i].fileId === entry.fileId; i += 1) {
        runLength += 1;
        if (!plan[i].skipped) counter += 1;
        end = plan[i].skipped ? end : counter;
      }
      const tagIndex = ((filePosition.get(entry.fileId) ?? 1) - 1) % 6;
      const tagStyle = { '--tag-color': `var(--color-tag-${tagIndex + 1})` } as any;
      if (runLength >= 4) {
        items.push(
          <li key={`caption-${entry.fileId}`} class={styles.caption} data-caption-for={entry.fileId}>
            <span class={styles['tag-square']} style={tagStyle} aria-hidden="true" />
            <FileName name={file.file.name} className={styles['caption-name']} />
            <span class={styles['caption-meta']}>
              {formatMessage(t.captionPages, { from: runStart, to: end })}
            </span>
          </li>,
        );
      } else {
        tagForThisCell = { name: file.file.name, style: tagStyle };
      }
    }

    const thumbnail = thumbnails.current.get(entry.key);
    const aspect = aspects.current.get(entry.key);
    const rotated90 = entry.rotation === 90 || entry.rotation === 270;
    const sourceLandscape = aspect != null && aspect >= 1;
    const finalLandscape = rotated90 ? !sourceLandscape : sourceLandscape;
    // Review P1/D2: every cell keeps the SAME fixed height (the portrait
    // box's height) so rows stay level; a landscape or rotated-to-landscape
    // page takes a landscape WIDTH for that height instead of being squeezed
    // into (or, the old bug, shrinking the whole box into) a portrait
    // footprint. `aspect` is the un-rotated source image's own width/height
    // (measured from the rendered thumbnail, before any user rotation); a
    // 90/270 rotation swaps what the DISPLAYED aspect is, so invert it there.
    // Before a thumbnail has rendered (aspect unknown) a landscape page still
    // needs a size: fall back to the previous implicit ratio (portrait
    // height / portrait width), the same footprint this cell had before.
    const displayedAspect = aspect != null
      ? (rotated90 ? 1 / aspect : aspect)
      : gridBase.h / gridBase.w;
    const cellStyle = {
      '--cell-w': `${finalLandscape ? Math.round(gridBase.h * displayedAspect) : gridBase.w}px`,
      '--cell-h': `${gridBase.h}px`,
      // A landscape cell is roughly two portrait columns wide; span two grid
      // tracks so it keeps a real (never 75%-scaled) footprint instead of
      // being squeezed into one column's width.
      gridColumn: finalLandscape ? 'span 2' : undefined,
    } as any;
    const thumbStyle = rotated90
      ? { width: 'var(--cell-h)', height: 'var(--cell-w)', transform: `rotate(${entry.rotation}deg)` }
      : entry.rotation === 180 ? { transform: 'rotate(180deg)' } : undefined;
    const tagIndex = ((filePosition.get(entry.fileId) ?? 1) - 1) % 6;
    // The file's colour and this page's stagger step: CSS reads both (the band,
    // the linked highlight, the download moment), the markup only supplies them.
    const pageVars = {
      '--tag-color': `var(--color-tag-${tagIndex + 1})`,
      '--moment-delay': `${Math.min(index, 15) * 40}ms`,
    } as any;
    const action = cellAction?.(entry) ?? null;
    const label = formatMessage(t.pageItemLabel, {
      number: position,
      total: outputTotal,
      file: file.file.name,
      state: entry.skipped ? t.skippedState : '',
    });
    items.push(
      <li
        key={entry.key}
        class={styles.page}
        data-key={entry.key}
        data-file-id={entry.fileId}
        data-rotation={entry.rotation || undefined}
        data-skipped={entry.skipped || undefined}
        data-selected={selectedKey === entry.key || undefined}
        style={{ ...cellStyle, ...pageVars }}
        tabIndex={0}
        aria-label={label}
        onClick={(event) => {
          // A click on one of the cluster's own buttons is that button's,
          // not a tap on the page.
          if ((event.target as HTMLElement).closest('button, a')) return;
          setSelectedKey((current) => (current === entry.key ? null : entry.key));
        }}
        onKeyDown={(event) => onCardKeyDown(event, index, entry.key)}
        onFocus={() => {
          if (keyboardActiveRef.current) onFirstKeyboardFocus?.();
        }}
      >
        {/* Reserved strip: every cell carries this, at the same height,
            whether or not it is a run's first cell - that is what keeps
            every thumbnail below it aligned to one row, tag or no tag. */}
        {labelSources && (
          <span class={styles['cell-tag']}>
            {tagForThisCell && (
              <>
                <span class={styles['cell-tag-square']} style={tagForThisCell.style} aria-hidden="true" />
                <FileName name={tagForThisCell.name} className={styles['cell-tag-name']} extension={false} />
              </>
            )}
          </span>
        )}
        <span class={styles['thumb-box']} data-thumb-box>
          {labelSources && <span class={styles.band} data-band aria-hidden="true" />}
          {thumbnail ? (
            <img
              class={styles.thumb}
              src={thumbnail}
              alt=""
              draggable={false}
              loading="lazy"
              style={thumbStyle}
              ref={(img: HTMLImageElement | null) => {
                // Already decoded at mount (cache hit): arrive without waiting for onLoad.
                if (img?.complete && img.naturalWidth) img.dataset.ready = '';
              }}
              onLoad={(event) => {
                const img = event.currentTarget as HTMLImageElement;
                img.dataset.ready = '';
                if (img.naturalWidth && img.naturalHeight && !aspects.current.has(entry.key)) {
                  aspects.current.set(entry.key, img.naturalWidth / img.naturalHeight);
                  bump((n) => n + 1);
                }
              }}
            />
          ) : file.error ? (
            <span class={styles['lock-glyph']} aria-hidden="true">L</span>
          ) : null}
        </span>
        <span class={styles.number} data-page-number>{position}</span>
        {/* Every card reserves the same state line. Previously only a skipped
            card rendered this flex child, making that card taller; because
            cards are bottom-aligned, its thumbnail jumped upward. */}
        <span
          class={styles['skipped-word']}
          data-visible={entry.skipped || undefined}
          aria-hidden={!entry.skipped}
        >
          {entry.skipped ? t.skippedBadge.toLowerCase() : '\u00a0'}
        </span>
        <span class={styles.actions}>
          <button
            type="button"
            class={styles.action}
            aria-label={formatMessage(t.rotatePage, { number: position })}
            onClick={() => rotate(entry.key, position)}
          >
            {/* The visual chrome (border, background, shadow) lives on this
                inner span, not the button: on touch (a selected cell, coarse
                pointer) the button's own box grows to a real 44x44 - a rect
                measurement, not only elementFromPoint, must read 44 - while
                this glyph stays visually 32, centred inside it by padding.
                Pointer devices are unchanged: the button stays 32x32 and the
                44x44 hit area is the `::before` below, as before. */}
            <span class={styles['action-glyph']} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M13 8a5 5 0 1 1-1.5-3.6" />
                <path d="M13 2v3h-3" />
              </svg>
            </span>
            {/* Item 6 (Shlomi's follow-up): a `title` attribute is not a
                visible tooltip. This span carries the short word, hidden
                until the button is hovered or keyboard-focused; the
                aria-label above stays the real accessible name so a screen
                reader is never told the word twice. */}
            <span class={styles.tip} aria-hidden="true">{t.tipRotate}</span>
          </button>
          <button
            type="button"
            class={styles.action}
            aria-pressed={entry.skipped}
            aria-label={formatMessage(entry.skipped ? t.includePage : t.skipPage, { number: position })}
            onClick={() => toggleSkip(entry.key, position)}
          >
            <span class={styles['action-glyph']} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                {entry.skipped ? (
                  <>
                    <path d="M2.1 12a10.8 10.8 0 0 1 19.8 0 10.8 10.8 0 0 1-19.8 0Z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                ) : (
                  <>
                    <path d="m3 3 18 18" />
                    <path d="M10.7 5.1A10.7 10.7 0 0 1 12 5c4.2 0 7.8 2.6 9.5 7a11.6 11.6 0 0 1-1.2 2.2" />
                    <path d="M6.7 6.7A11.4 11.4 0 0 0 2.5 12c1.7 4.4 5.3 7 9.5 7 1.5 0 3-.4 4.3-1" />
                    <path d="M14.1 14.1a3 3 0 0 1-4.2-4.2" />
                  </>
                )}
              </svg>
            </span>
            <span class={styles.tip} aria-hidden="true">{entry.skipped ? t.tipBringBack : t.tipSkip}</span>
          </button>
          <button
            type="button"
            class={styles.action}
            aria-label={formatMessage(t.openPreview, { number: position })}
            onClick={() => openPreview(index)}
          >
            <span class={styles['action-glyph']} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" />
                <path d="M10.3 10.3L14 14" />
              </svg>
            </span>
            <span class={styles.tip} aria-hidden="true">{t.tipOpen}</span>
          </button>
          {action && (
            <a
              class={styles.action}
              href={action.href}
              download={action.download}
              aria-label={action.label}
              onClick={(event) => { event.stopPropagation(); action.onActivate?.(); }}
            >
              <span class={styles['action-glyph']} aria-hidden="true"><Download size={16} strokeWidth={1.8} /></span>
              <span class={styles.tip} aria-hidden="true">{action.tip}</span>
            </a>
          )}
        </span>
      </li>,
    );
  });

  return (
    <section class={styles.section} aria-labelledby={labelledBy}>
      <p class="sr-only" id="page-grid-hint">{t.stripHint}</p>
      <ul
        class={styles.grid}
        ref={gridRef}
        aria-describedby="page-grid-hint"
        data-page-grid
        data-reorderable={reorderable || undefined}
        data-grouped={labelled || undefined}
        data-fit-settled={fitSettledNow || undefined}
        style={{ '--grid-cell': `${gridCell}px`, '--grid-gap': `${gridGap}px` } as any}
      >
        {items}
      </ul>
      {PreviewDialog && (
        <PreviewDialog
          target={previewTarget}
          onClose={() => setPreviewIndex(null)}
          onStep={(delta) => setPreviewIndex((current) => (current == null ? null : Math.max(0, Math.min(plan.length - 1, current + delta))))}
          toggle={previewTarget && plan[previewIndex as number]?.skipped ? {
            label: t.previewIncludeAgain,
            pressed: true,
            note: t.previewSkippedNote,
            ariaLabel: formatMessage(t.includePage, { number: outputPositionAt(previewIndex as number) }),
            onToggle: () => {
              if (previewIndex == null) return;
              const entry = plan[previewIndex];
              if (entry) toggleSkip(entry.key, outputPositionAt(previewIndex));
            },
          } : undefined}
          messages={{ close: t.previewClose, previous: t.previewPrev, next: t.previewNext, loading: t.previewLoading }}
        />
      )}
    </section>
  );
}
