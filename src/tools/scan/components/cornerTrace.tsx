import { useEffect, useRef } from 'preact/hooks';
import type { Ref } from 'preact';
import type { Point } from '#lib/pageEnhance/quad.ts';
import styles from './CornerEditor.module.css';

/** The `d` string of the page's closed border: M, then an L per further point, then Z. @testSeam */
export const tracePath = (points: Point[]) => `M${points.map((p) => `${p.x} ${p.y}`).join(' L')} Z`;

/** The dim layer's `d`: the whole photo minus the outline (the page's trace, or its straight quad), filled evenodd. @testSeam */
export const dimPath = (points: Point[]) => `M0 0H1V1H0Z M${points.map((p) => `${p.x} ${p.y}`).join(' L')} Z`;

/** The `d` of the border's drag dots: a zero-length segment per traced point, none at a corner (every 16th) or a pin. @testSeam */
export const dotsPath = (points: Point[], pinned: readonly number[]) =>
  points.map((p, i) => (i % 16 === 0 || pinned.includes(i) ? '' : `M${p.x} ${p.y}h0`)).join('');

/**
 * Owns the trace path's ref and its drag-time hiding. Gesture golden rule: the hide/show is written
 * straight to the DOM (no state); every render hands control back to props unless a gesture is active.
 */
export function useCornerTrace(
  trace: Point[] | null | undefined,
  outlineRef: { current: SVGPolygonElement | null },
  dimRef: { current: SVGPathElement | null },
  gestureRef: { current: unknown },
) {
  const traceRef = useRef<SVGPathElement | null>(null);
  const dotsRef = useRef<SVGPathElement | null>(null);
  const hasTrace = !!trace && trace.length > 0;
  // A drag hides the trace (it no longer matches the corners); props take control back on release.
  const showTrace = (shown: boolean) => {
    if (traceRef.current) traceRef.current.style.display = shown ? '' : 'none';
    if (dotsRef.current) dotsRef.current.style.display = shown ? '' : 'none';
    outlineRef.current?.classList.toggle(styles['outline-faint'], shown && hasTrace);
    // The dark area follows the traced border; a drag of a corner left it on the dragged quad.
    if (shown && hasTrace) dimRef.current?.setAttribute('d', dimPath(trace!));
  };
  // Every render hands control back to props (the inline hide and the removed class are drag-time only).
  useEffect(() => {
    if (!gestureRef.current) showTrace(true);
  });
  return { traceRef, dotsRef, showTrace, hasTrace };
}

export function CornerTracePath({ traceRef, points }: { traceRef: Ref<SVGPathElement>; points: Point[] }) {
  return (
    <path
      ref={traceRef}
      class={styles['trace']}
      data-trace
      d={tracePath(points)}
      fill="none"
      stroke-width="2"
      vector-effect="non-scaling-stroke"
    />
  );
}

/** Small round dots along the border that say it can be dragged. One path, so the stretched overlay cannot squash them. */
export function CornerTraceDots({ dotsRef, points, pinned }: { dotsRef: Ref<SVGPathElement>; points: Point[]; pinned: readonly number[] }) {
  return (
    <path
      ref={dotsRef}
      class={styles['trace-dots']}
      data-trace-dots
      d={dotsPath(points, pinned)}
      fill="none"
      stroke-width="6"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />
  );
}
