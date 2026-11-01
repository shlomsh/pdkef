import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { inkEnd, placeBar } from '../lib/marker/inkEnd.ts';
import { keyAction } from '../lib/marker/keys.ts';
import { HIGHLIGHT_COLORS, type Marker } from '../lib/marker/markerState.ts';
import { closeLayer, layersOf, scrolledPast, type Layers } from '../lib/marker/toolbarLayers.ts';
import { HINT_MS, hintSeen, markHintSeen } from '../lib/marker/hint.ts';
import { initialRest, nextTickAt, restReducer, type RestEvent, type RestState } from '../lib/marker/restDetector.ts';

type MoveLike = Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerType' | 'buttons'> & { target: EventTarget | null };

/** Where the first mark's ink ended, in page percent, and which way it reads. */
export interface HintAnchor { x: number; bottom: number; rtl: boolean }

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // expected: blocked storage only means the hint can show again
  }
}

/** The close of the one rest toolbar that is open in the workspace; opening another closes it. */
let activeClose: (() => void) | null = null;

/**
 * R2, R7, R8 for one page. Pointer moves feed the rest detector through refs and timers, never state;
 * state changes once, when the detector reports a highlight opened (or a tap, or the hint).
 */
export function useRestToolbar() {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [hint, setHint] = useState<HintAnchor | null>(null);
  const openRef = useRef<string | null>(null);
  const restRef = useRef<RestState>(initialRest);
  const lastRef = useRef({ x: 0, y: 0 });
  const tickTimer = useRef(0);
  const hintTimer = useRef(0);

  const closeRef = useRef<() => void>(() => {});

  const open = useCallback((id: string | null) => {
    if (id !== null) {
      if (activeClose && activeClose !== closeRef.current) activeClose();
      activeClose = closeRef.current;
    } else if (activeClose === closeRef.current) {
      activeClose = null;
    }
    openRef.current = id;
    setTargetId(id);
  }, []);

  const feed = useCallback((event: RestEvent) => {
    restRef.current = restReducer(restRef.current, event);
    window.clearTimeout(tickTimer.current);
    const opened = restRef.current.opened;
    if (opened !== null && openRef.current === null) {
      open(opened);
      return;
    }
    const at = nextTickAt(restRef.current);
    if (at !== null) {
      tickTimer.current = window.setTimeout(() => feed({ type: 'tick', t: performance.now() }), Math.max(0, at - performance.now()));
    }
  }, [open]);

  const onPointerMove = useCallback((e: MoveLike) => {
    lastRef.current = { x: e.clientX, y: e.clientY };
    if (openRef.current !== null || e.pointerType === 'touch' || e.buttons !== 0) return;
    const overId = (e.target as Element | null)?.closest?.('[data-element-id]')?.getAttribute('data-element-id') ?? null;
    feed({ type: 'move', x: e.clientX, y: e.clientY, t: performance.now(), overId });
  }, [feed]);

  const onPointerLeave = useCallback(() => {
    if (openRef.current === null) feed({ type: 'leave' });
  }, [feed]);

  /** A stroke just ended where the pointer is: no rest counts until it has gone 12 px away (R2). */
  const strokeEnd = useCallback(() => feed({ type: 'strokeEnd', x: lastRef.current.x, y: lastRef.current.y }), [feed]);

  /** R7: a tap opens a highlight at once. */
  const openFor = useCallback((id: string) => {
    window.clearTimeout(tickTimer.current);
    restRef.current = initialRest;
    open(id);
  }, [open]);

  const close = useCallback(() => {
    open(null);
    feed({ type: 'closed' });
  }, [open, feed]);

  closeRef.current = close;

  const clearHint = useCallback(() => {
    window.clearTimeout(hintTimer.current);
    setHint(null);
  }, []);

  /** R8: once ever, after the first mark. */
  const showHint = useCallback((anchor: HintAnchor) => {
    if (hintSeen(storage())) return;
    markHintSeen(storage());
    window.clearTimeout(hintTimer.current);
    setHint(anchor);
    hintTimer.current = window.setTimeout(() => setHint(null), HINT_MS);
  }, []);

  useEffect(() => () => {
    if (activeClose === closeRef.current) activeClose = null;
    window.clearTimeout(tickTimer.current);
    window.clearTimeout(hintTimer.current);
  }, []);

  return { targetId, hint, onPointerMove, onPointerLeave, strokeEnd, openFor, close, showHint, clearHint };
}

const SIX = HIGHLIGHT_COLORS.length;
const isTyping = (el: Element | null) => !!el && ((el as HTMLElement).isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

type ToolbarLive = { current: { layers: Layers; mark: HighlightElement; onChange(change: Partial<Marker>): void; onDelete(): void; onComment(): void; onClose(): void; look: Marker } };

/** Placed once, before paint: beside the end of the last band, off the line, inside the screen. */
export function useToolbarPlacement(rootRef: { current: HTMLDivElement | null }, hlRef: { current: HTMLButtonElement | null }, mark: HighlightElement, rtl: boolean) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    const parent = root?.offsetParent as HTMLElement | null;
    if (!root || !parent) return;
    const box = parent.getBoundingClientRect();
    const end = inkEnd(mark);
    const cell = parseFloat(getComputedStyle(root).getPropertyValue('--cell')) || 32;
    const barW = root.offsetWidth;
    const placed = placeBar({
      x: box.left + (end.x / 100) * box.width,
      lineTop: box.top + (end.top / 100) * box.height,
      lineBottom: box.top + (end.bottom / 100) * box.height,
      barW,
      barMaxW: barW - (hlRef.current?.offsetWidth ?? 0) + (SIX + 1) * cell,
      barH: root.offsetHeight,
      vw: document.documentElement.clientWidth,
      vh: window.innerHeight,
      topMin: 8,
      rtl,
    });
    root.dataset.side = placed.side;
    root.style.top = `${placed.top - box.top}px`;
    if (placed.align === 'left') {
      root.style.left = `${placed.edge - box.left}px`;
      root.style.right = 'auto';
    } else {
      root.style.right = `${box.right - placed.edge}px`;
      root.style.left = 'auto';
    }
  }, []);
}

/** R9: keys, a press elsewhere, and a scroll of more than 24 px. */
export function useToolbarDismissal(
  rootRef: { current: HTMLDivElement | null },
  live: ToolbarLive,
  { setLayers, foldRow, toggleUnderline }: { setLayers: (fn: (l: Layers) => Layers) => void; foldRow(): void; toggleUnderline(): void },
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { layers: current, onChange: change, onDelete: del, onClose: close } = live.current;
      if (activeClose && activeClose !== close) return; // another page's toolbar is the open one
      const action = keyAction(e, { typing: isTyping(e.target as Element | null), layers: layersOf(current) });
      if (!action) return;
      if (action.type === 'color') {
        e.preventDefault();
        change({ color: HIGHLIGHT_COLORS[action.index].hex });
        foldRow();
      } else if (action.type === 'underline') {
        e.preventDefault();
        toggleUnderline();
      } else if (action.type === 'comment') {
        e.preventDefault();
        live.current.onComment();
      } else if (action.type === 'delete') {
        e.preventDefault();
        del();
      } else if (action.type === 'closeLayer') {
        e.preventDefault();
        if (action.layer === 'custom' || action.layer === 'colors') setLayers((l) => closeLayer(l, action.layer as 'custom' | 'colors'));
        else {
          // Focus inside the bar or on its mark goes back to the mark; focus elsewhere stays where it is.
          const mark = document.querySelector<HTMLElement>(`[data-editor-element-id="${live.current.mark.id}"]`);
          const active = document.activeElement;
          const keep = !!active && (active === mark || !!rootRef.current?.contains(active));
          close();
          if (keep) mark?.focus();
        }
      }
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (rootRef.current?.contains(target)) return;
      if (target?.closest?.(`[data-element-id="${live.current.mark.id}"]`)) return;
      live.current.onClose();
    };
    const workspace = rootRef.current?.closest<HTMLElement>('[data-workspace]') ?? null;
    const start = { win: window.scrollY, ws: workspace?.scrollTop ?? 0 };
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target === document) {
        if (scrolledPast(start.win, window.scrollY)) live.current.onClose();
      } else if (target === workspace && workspace && scrolledPast(start.ws, workspace.scrollTop)) {
        live.current.onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, []);
}

