import { useEffect } from 'preact/hooks';
import { startGesture, type GestureEvent } from '#lib/gestures/controller.ts';

const inRect = (r: DOMRect, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/**
 * Pan the board with a mouse: a drag that starts on the board outside the page boxes, or any drag while Space
 * is held. Scroll positions are written straight to the DOM while the button is down and nothing is committed
 * (the gesture golden rule). Touch keeps its native one-finger scroll.
 */
export function useBoardPan({ workspaceRef, fullscreen, enabled }: {
  workspaceRef: { current: HTMLElement | null };
  fullscreen: boolean;
  enabled: boolean;
}) {
  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws || !enabled) return;
    let space = false;
    const grab = (on: boolean) => { ws.style.cursor = on ? 'grab' : ''; };
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e)) return;
      e.preventDefault();
      space = true;
      grab(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      space = false;
      grab(false);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const cards = [...ws.querySelectorAll('[data-editor-page-card]')].map((c) => c.getBoundingClientRect());
      const onPage = cards.some((r) => inRect(r, e.clientX, e.clientY));
      const onControl = (e.target as HTMLElement).closest('button, a, input, select, textarea, [role="menu"], [role="toolbar"]');
      if (onControl || (onPage && !space)) return;
      e.preventDefault();
      if (space) e.stopPropagation();
      const start = { x: e.clientX, y: e.clientY, left: ws.scrollLeft, top: fullscreen ? ws.scrollTop : window.scrollY };
      ws.style.cursor = 'grabbing';
      const done = () => grab(space);
      startGesture<{ dx: number; dy: number }>({
        computePatch: (ev: GestureEvent) => {
          const m = ev as MouseEvent;
          return { dx: m.clientX - start.x, dy: m.clientY - start.y };
        },
        writeDOM: ({ dx, dy }) => {
          ws.scrollLeft = start.left - dx;
          if (fullscreen) ws.scrollTop = start.top - dy;
          else window.scrollTo(window.scrollX, start.top - dy);
        },
        commit: done,
        cancel: done,
      });
    };

    ws.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      ws.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      ws.style.cursor = '';
    };
  }, [workspaceRef, fullscreen, enabled]);
}
