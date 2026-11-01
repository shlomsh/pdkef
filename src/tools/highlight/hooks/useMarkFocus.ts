import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { marksInReadingOrder } from '../lib/marker/readingOrder.ts';

/**
 * The one shared fact of the roving group: the last mark that had focus. The order and the stop are
 * derived from `elements`, which every page receives whole. A stale id (another document) is not in
 * the order, so the stop falls back to the first mark; the last page to unmount clears it.
 */
let lastFocused: string | null = null;
const listeners = new Set<() => void>();

function setLastFocused(id: string | null) {
  if (lastFocused === id) return;
  lastFocused = id;
  listeners.forEach((fn) => fn());
}

const NEXT = new Set(['ArrowDown', 'ArrowRight']);
const PREV = new Set(['ArrowUp', 'ArrowLeft']);

/** The way a page reads: right to left when most of its marks were laid that way. */
const pageDirection = (marks: HighlightElement[], pageIndex: number) => {
  const own = marks.filter((m) => m.pageIndex === pageIndex);
  return own.filter((m) => m.direction === 'rtl').length * 2 > own.length ? 'rtl' : 'ltr';
};

/**
 * R39: every highlight of the document is one roving-tabindex group in reading order. Arrow keys, Home
 * and End move focus across pages; focusing a mark with the keyboard opens its rest toolbar (as a tap
 * does, through `openFor`). A press with a pointer focuses without opening: rest and tap own that path.
 */
export function useMarkFocus({ elements, openFor }: { elements: EditorElement[]; openFor: (id: string) => void }) {
  const [, rerender] = useState(0);
  const pointerFocus = useRef(false);
  const live = useRef(openFor);
  live.current = openFor;

  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
      if (listeners.size === 0) lastFocused = null;
    };
  }, []);

  const order = useMemo(() => {
    const marks = elements.filter((el): el is HighlightElement => el.type === 'highlight');
    return marksInReadingOrder(marks, (page) => pageDirection(marks, page)).map((m) => m.id);
  }, [elements]);

  const stop = lastFocused !== null && order.includes(lastFocused) ? lastFocused : (order[0] ?? null);

  const move = (to: string | undefined) => {
    if (!to) return;
    const node = document.querySelector<HTMLElement>(`[data-editor-element-id="${to}"]`);
    if (!node) return;
    node.focus();
    node.scrollIntoView?.({ block: 'nearest' });
  };

  const markProps = (id: string) => ({
    tabIndex: id === stop ? 0 : -1,
    onPointerDown: () => { pointerFocus.current = true; },
    onFocus: (e: FocusEvent) => {
      const byPointer = pointerFocus.current;
      pointerFocus.current = false;
      setLastFocused(id);
      // Focus handed back from the toolbar (Esc) must not reopen the toolbar it just closed.
      const fromBar = !!(e.relatedTarget as Element | null)?.closest?.('[data-rest-toolbar]');
      if (!byPointer && !fromBar) live.current(id);
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      const at = order.indexOf(id);
      if (NEXT.has(e.key)) move(order[Math.min(order.length - 1, at + 1)]);
      else if (PREV.has(e.key)) move(order[Math.max(0, at - 1)]);
      else if (e.key === 'Home') move(order[0]);
      else if (e.key === 'End') move(order[order.length - 1]);
      else return;
      e.preventDefault();
    },
  });

  return { markProps };
}
