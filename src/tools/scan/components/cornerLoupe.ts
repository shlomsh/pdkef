import type { GestureEvent } from '#lib/gestures/controller.ts';
import type { Point } from '#lib/pageEnhance/quad.ts';
import { loupeView, placeLoupe } from '../lib/loupe.ts';

/** Where a mouse or touch event is, in client pixels (the first touch of a touch event). */
export function clientPoint(event: GestureEvent): { x: number; y: number } {
  const t = ('touches' in event ? (event.touches?.[0] ?? event.changedTouches?.[0]) : undefined) ?? (event as MouseEvent);
  return { x: t.clientX, y: t.clientY };
}

/**
 * The loupe: a finger or the handle's ring covers the very point it places. Written straight to the
 * DOM, like the drag. `point` and its two `neighbours` are normalized to the shown photo. Without
 * `neighbours` only the photo and the crosshair show and the two edge lines are hidden.
 */
export function showLoupe(
  loupe: HTMLDivElement | null,
  lines: (SVGLineElement | null)[],
  point: Point,
  neighbours: [Point, Point] | undefined,
  client: { x: number; y: number },
  rect: DOMRect,
) {
  if (!loupe) return;
  const at = placeLoupe(client, { width: window.innerWidth, height: window.innerHeight });
  const view = loupeView(point, neighbours ?? [point, point], rect);
  loupe.style.left = `${at.left}px`;
  loupe.style.top = `${at.top}px`;
  loupe.style.backgroundSize = view.backgroundSize;
  loupe.style.backgroundPosition = view.backgroundPosition;
  view.edges.forEach((edge, i) => {
    const line = lines[i];
    if (!line) return;
    line.style.display = neighbours ? '' : 'none';
    line.setAttribute('x1', String(edge.x1));
    line.setAttribute('y1', String(edge.y1));
    line.setAttribute('x2', String(edge.x2));
    line.setAttribute('y2', String(edge.y2));
  });
  loupe.hidden = false;
}
