import { useEffect, useRef } from 'preact/hooks';
import type { DeletablePdfObject } from './DeletableObjectOverlay.tsx';
import { isMarqueeDrag, marqueeRect, MARQUEE_HOLD_MS, objectsInMarquee, type PercentPoint } from './deleteMarquee.ts';
import styles from './PdfRedactTool.module.css';

/**
 * RED-33: drag a box across a page while Delete is armed and everything with
 * half its area inside goes on release. Renders only the box itself; the
 * gesture listens on the page wrapper it sits in.
 *
 * Golden rule: the box and the live highlights are written straight to the
 * DOM on every move (a class on the targets, found by data-delete-id); the
 * one commit happens on release. Mouse and pen start past 5px; touch keeps
 * scrolling until a 300ms press-and-hold, then the drag draws.
 */
export default function DeleteMarquee({ objects, onCommit }: {
  /** The page's deletable objects that are not already marked. */
  objects: readonly DeletablePdfObject[];
  onCommit: (objects: DeletablePdfObject[]) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ objects, onCommit });
  latest.current = { objects, onCommit };

  useEffect(() => {
    const box = boxRef.current;
    const wrapper = box?.parentElement;
    if (!box || !wrapper) return;

    let pointerId: number | null = null;
    let start: PercentPoint = { x: 0, y: 0 };
    let startClient = { x: 0, y: 0 };
    let active = false; // the box is being drawn
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let hot = new Set<string>();

    const toPercent = (clientX: number, clientY: number): PercentPoint => {
      const r = wrapper.getBoundingClientRect();
      const clamp = (v: number) => Math.max(0, Math.min(100, v));
      return { x: clamp(((clientX - r.left) / r.width) * 100), y: clamp(((clientY - r.top) / r.height) * 100) };
    };

    const setHot = (ids: Set<string>) => {
      for (const el of wrapper.querySelectorAll<HTMLElement>('[data-delete-id]')) {
        el.classList.toggle(styles['delete-candidate-hot'], ids.has(el.dataset.deleteId ?? ''));
      }
      hot = ids;
    };

    const paint = (end: PercentPoint) => {
      const rect = marqueeRect(start, end);
      box.style.display = 'block';
      box.style.left = `${rect.left}%`;
      box.style.top = `${rect.top}%`;
      box.style.width = `${rect.width}%`;
      box.style.height = `${rect.height}%`;
      return rect;
    };

    const stopListening = () => {
      clearTimeout(holdTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', onKey);
      wrapper.removeEventListener('touchmove', onTouchMove);
      wrapper.removeEventListener('contextmenu', onContextMenu);
      wrapper.style.userSelect = '';
      box.style.display = 'none';
      setHot(new Set());
      pointerId = null;
      active = false;
    };

    const cancel = () => { if (pointerId !== null) stopListening(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    const onContextMenu = (e: Event) => e.preventDefault();
    // Once the hold has fired the finger belongs to the box, not to scrolling.
    const onTouchMove = (e: TouchEvent) => { if (active && e.cancelable) e.preventDefault(); };

    const begin = () => {
      active = true;
      wrapper.style.userSelect = 'none';
      paint(start);
    };

    function onMove(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startClient.x;
      const dy = e.clientY - startClient.y;
      if (!active) {
        if (e.pointerType === 'touch') {
          // Moved before the hold finished: the person is scrolling.
          if (isMarqueeDrag(dx, dy)) cancel();
          return;
        }
        if (!isMarqueeDrag(dx, dy)) return;
        begin();
      }
      const rect = paint(toPercent(e.clientX, e.clientY));
      const next = new Set(objectsInMarquee(latest.current.objects, rect).map((o) => o.id));
      if (next.size !== hot.size || [...next].some((id) => !hot.has(id))) setHot(next);
    }

    function onUp(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      const dragged = active && isMarqueeDrag(e.clientX - startClient.x, e.clientY - startClient.y);
      const rect = dragged ? marqueeRect(start, toPercent(e.clientX, e.clientY)) : null;
      stopListening();
      if (!rect) return; // a plain click falls through to the target under it
      // The release also produces a click; it must not delete the target it lands on.
      const swallow = (ev: Event) => ev.stopPropagation();
      wrapper?.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => wrapper?.removeEventListener('click', swallow, { capture: true }), 0);
      const picked = objectsInMarquee(latest.current.objects, rect);
      if (picked.length) latest.current.onCommit(picked);
    }

    const onDown = (e: PointerEvent) => {
      if (pointerId !== null) { cancel(); return; } // a second finger means pinch
      if (e.pointerType !== 'touch' && e.button !== 0) return;
      if ((e.target as Element | null)?.closest(`.${styles['redact-box']}`)) return;
      pointerId = e.pointerId;
      startClient = { x: e.clientX, y: e.clientY };
      start = toPercent(e.clientX, e.clientY);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', onKey);
      wrapper.addEventListener('touchmove', onTouchMove, { passive: false });
      wrapper.addEventListener('contextmenu', onContextMenu);
      if (e.pointerType === 'touch') holdTimer = setTimeout(begin, MARQUEE_HOLD_MS);
    };

    wrapper.addEventListener('pointerdown', onDown);
    return () => {
      wrapper.removeEventListener('pointerdown', onDown);
      cancel();
    };
  }, []);

  return <div ref={boxRef} class={styles['delete-marquee']} aria-hidden="true" />;
}
