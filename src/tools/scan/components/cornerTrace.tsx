import { useEffect, useRef } from 'preact/hooks';
import type { Ref } from 'preact';
import type { Point } from '#lib/pageEnhance/quad.ts';
import styles from './CornerEditor.module.css';

const pc = (v: number) => `${v * 100}%`;

/** One line per side of the closed ring of points, as percent strings (the overlay svg has no viewBox, so nothing is scaled). @testSeam */
export const segments = (points: Point[]) =>
  points.map((p, i) => {
    const q = points[(i + 1) % points.length];
    return { x1: pc(p.x), y1: pc(p.y), x2: pc(q.x), y2: pc(q.y) };
  });

/** The dim layer's clip: the whole photo minus the outline (the page's trace, or its straight quad). @testSeam */
export const dimClip = (points: Point[]) =>
  `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${[...points, points[0]].map((p) => `${pc(p.x)} ${pc(p.y)}`).join(', ')})`;

/** Writes the dim's clip, with the prefixed property WebKit still wants. */
export function paintDim(el: HTMLElement | null, points: Point[]) {
  if (!el) return;
  const v = dimClip(points);
  el.style.setProperty('clip-path', v);
  el.style.setProperty('-webkit-clip-path', v);
}

/** Rewrites the lines of a `<g>` in order, through the ref, during a gesture. */
export function paintSegments(g: SVGGElement | null, points: Point[]) {
  if (!g) return;
  const ls = g.children;
  segments(points).forEach((s, i) => {
    const l = ls[i];
    if (!l) return;
    l.setAttribute('x1', s.x1);
    l.setAttribute('y1', s.y1);
    l.setAttribute('x2', s.x2);
    l.setAttribute('y2', s.y2);
  });
}

/** The lines of a closed ring, to sit inside a `<g>`. */
export const Lines = ({ points, width, round }: { points: Point[]; width: number; round?: boolean }) => (
  <>
    {segments(points).map((s, i) => (
      <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke-width={width} stroke-linecap={round ? 'round' : undefined} />
    ))}
  </>
);

/** The traced points that get a drag dot: all but the corners (every 16th) and the pinned ones. @testSeam */
export const dotIndices = (count: number, pinned: readonly number[]): number[] =>
  Array.from({ length: count }, (_, i) => i).filter((i) => i % 16 !== 0 && !pinned.includes(i));

/**
 * Owns the trace path's ref and its drag-time hiding. Gesture golden rule: the hide/show is written
 * straight to the DOM (no state); every render hands control back to props unless a gesture is active.
 */
export function useCornerTrace(
  trace: Point[] | null | undefined,
  outlineRef: { current: SVGGElement | null },
  dimRef: { current: HTMLElement | null },
  gestureRef: { current: unknown },
) {
  const traceRef = useRef<SVGGElement | null>(null);
  const dotsRef = useRef<HTMLDivElement | null>(null);
  const hasTrace = !!trace && trace.length > 0;
  // A drag hides the trace (it no longer matches the corners); props take control back on release.
  const showTrace = (shown: boolean) => {
    if (traceRef.current) traceRef.current.style.display = shown ? '' : 'none';
    if (dotsRef.current) dotsRef.current.style.display = shown ? '' : 'none';
    outlineRef.current?.classList.toggle(styles['outline-faint'], shown && hasTrace);
    // The dark area follows the traced border; a drag of a corner left it on the dragged quad.
    if (shown && hasTrace) paintDim(dimRef.current, trace!);
  };
  // Every render hands control back to props (the inline hide and the removed class are drag-time only).
  useEffect(() => {
    if (!gestureRef.current) showTrace(true);
  });
  return { traceRef, dotsRef, showTrace, hasTrace };
}

export function CornerTracePath({ traceRef, points }: { traceRef: Ref<SVGGElement>; points: Point[] }) {
  return (
    <g ref={traceRef} class={styles['trace']} data-trace fill="none">
      <Lines points={points} width={2} round />
    </g>
  );
}

/** Small round dots along the border that say it can be dragged. HTML, not SVG: a zero-length round-cap stroke is drawn as a blob in WebKit. */
export function CornerTraceDots({ dotsRef, points, pinned }: { dotsRef: Ref<HTMLDivElement>; points: Point[]; pinned: readonly number[] }) {
  return (
    <div class={styles['trace-dots']} data-trace-dots aria-hidden="true" ref={dotsRef}>
      {dotIndices(points.length, pinned).map((i) => (
        <span key={i} class={styles['trace-dot']} data-dot={i} style={{ left: `${points[i].x * 100}%`, top: `${points[i].y * 100}%` }} />
      ))}
    </div>
  );
}
