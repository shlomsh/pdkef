import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { isTypingTarget } from '#lib/history/isTypingTarget.ts';
import { keyAction, markKeyIntent } from '../lib/marker/keys.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import { scrolledPast } from '../lib/marker/toolbarLayers.ts';
import { HINT_MS, hintSeen, markHintSeen } from '../lib/marker/hint.ts';
import type { PanelAnchor } from '../lib/marker/panelAnchor.ts';
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
 * R2, R7, R8 for one page. A rest outlines the mark (`restId`); a click or keyboard focus opens its row
 * (`openFor`). Pointer moves feed the rest detector through refs and timers, never state; state changes
 * once, when the detector reports a different resting mark (or an open, or the hint).
 */
export function useRestToolbar() {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [restId, setRestId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<PanelAnchor | null>(null);
  const [hint, setHint] = useState<HintAnchor | null>(null);
  const openRef = useRef<string | null>(null);
  const restRef = useRef<RestState>(initialRest);
  const restIdRef = useRef<string | null>(null);
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
    const rested = restRef.current.rested;
    if (rested !== restIdRef.current) {
      restIdRef.current = rested;
      setRestId(rested);
    }
    const at = nextTickAt(restRef.current);
    if (at !== null) {
      tickTimer.current = window.setTimeout(() => feed({ type: 'tick', t: performance.now() }), Math.max(0, at - performance.now()));
    }
  }, [open]);

  const onPointerMove = useCallback((e: MoveLike) => {
    lastRef.current = { x: e.clientX, y: e.clientY };
    if (openRef.current !== null || e.pointerType === 'touch') return;
    // A press that moves is a stroke: a rest already drawn goes, and one still waiting never lands.
    if (e.buttons !== 0) { feed({ type: 'leave' }); return; }
    const overId = (e.target as Element | null)?.closest?.('[data-element-id]')?.getAttribute('data-element-id') ?? null;
    feed({ type: 'move', x: e.clientX, y: e.clientY, t: performance.now(), overId });
  }, [feed]);

  const onPointerLeave = useCallback(() => {
    if (openRef.current === null) feed({ type: 'leave' });
  }, [feed]);

  /** A stroke just ended where the pointer is: no rest counts until it has gone 12 px away (R2). */
  const strokeEnd = useCallback(() => feed({ type: 'strokeEnd', x: lastRef.current.x, y: lastRef.current.y }), [feed]);

  /** R7: a click or keyboard focus opens a highlight at once; `at` is where it was pressed. */
  const openFor = useCallback((id: string, at: PanelAnchor | null = null) => {
    window.clearTimeout(tickTimer.current);
    restRef.current = initialRest;
    restIdRef.current = null;
    setRestId(null);
    setAnchor(at);
    open(id);
  }, [open]);

  const close = useCallback(() => {
    setAnchor(null);
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

  return { restId, targetId, anchor, hint, onPointerMove, onPointerLeave, strokeEnd, openFor, close, showHint, clearHint };
}

type ToolbarLive = { current: { mark: HighlightElement; onChange(change: Partial<Marker>): void; onDelete(): void; onComment(): void; onClose(): void; look: Marker } };

/** R9: keys, a press elsewhere, and a scroll of more than 24 px. */
export function useToolbarDismissal(
  rootRef: { current: HTMLDivElement | null },
  live: ToolbarLive,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { onChange: change, onDelete: del, onClose: close } = live.current;
      if (activeClose && activeClose !== close) return; // another page's toolbar is the open one
      const action = keyAction(e, { typing: isTypingTarget(e.target), layers: ['toolbar'] });
      if (!action) return;
      // A color or thickness menu that is open answers Esc itself.
      if (action.type === 'closeLayer' && document.querySelector('[data-editor-popover]')) return;
      const intent = markKeyIntent(action, live.current.look);
      if (intent) {
        e.preventDefault();
        if ('change' in intent) change(intent.change);
        else if ('comment' in intent) live.current.onComment();
        else del();
      } else if (action.type === 'closeLayer') {
        e.preventDefault();
        // Focus inside the bar or on its mark goes back to the mark; focus elsewhere stays where it is.
        const mark = document.querySelector<HTMLElement>(`[data-editor-element-id="${live.current.mark.id}"]`);
        const active = document.activeElement;
        const keep = !!active && (active === mark || !!rootRef.current?.contains(active));
        close();
        if (keep) mark?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (rootRef.current?.contains(target) || target?.closest?.('[data-editor-popover]')) return;
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

