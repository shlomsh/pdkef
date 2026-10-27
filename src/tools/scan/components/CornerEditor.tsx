import { useEffect, useRef } from 'preact/hooks';
import { startGesture, type GestureEvent } from '../../../lib/gestures/controller.ts';
import { clampPoint, isPagelike, type Quad } from '../lib/quad.ts';
import { LOUPE_SIZE, loupeView, placeLoupe } from '../lib/loupe.ts';
import styles from './CornerEditor.module.css';

interface CornerEditorProps {
  src: string;
  /** The photo's width over height: the frame takes this shape before the image decodes. */
  aspect?: number;
  quad: Quad;
  onCommit(quad: Quad): void;
  /** Already localized, e.g. corners[0] = 'Top-left corner'. */
  labels: { group: string; corners: [string, string, string, string] };
}

const STEP = 0.005;
const STEP_SHIFT = 0.02;
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const pct = (v: number) => `${v * 100}%`;
/** A quad a page could be: every corner a real page's (isPagelike), and not a sliver (1% of the
 * photo), which would warp to a line. */
const usable = (q: Quad) => {
  let twice = 0;
  for (let i = 0; i < 4; i += 1) twice += q[i].x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * q[i].y;
  return isPagelike(q) && Math.abs(twice) / 2 >= 0.01;
};
const outlinePoints = (q: Quad) => q.map((p) => `${p.x},${p.y}`).join(' ');
// The whole photo plus the quad, filled evenodd: dims everything outside the quad.
const dimPath = (q: Quad) => `M0 0H1V1H0Z M${q.map((p) => `${p.x} ${p.y}`).join(' L')} Z`;

function clientPoint(event: GestureEvent): { x: number; y: number } {
  const t = ('touches' in event ? (event.touches?.[0] ?? event.changedTouches?.[0]) : undefined) ?? (event as MouseEvent);
  return { x: t.clientX, y: t.clientY };
}

// The photo with four draggable corners. Gesture golden rule: a drag moves the
// handle and rewrites the outline straight through refs, and the final quad goes
// to onCommit once, on release. Render always derives from the `quad` prop.
export default function CornerEditor({ src, aspect, quad, onCommit, labels }: CornerEditorProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const handleRefs = useRef<(HTMLButtonElement | null)[]>([null, null, null, null]);
  const outlineRef = useRef<SVGPolygonElement | null>(null);
  const dimRef = useRef<SVGPathElement | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const loupeRef = useRef<HTMLDivElement | null>(null);
  const loupeEdgeRefs = useRef<(SVGLineElement | null)[]>([null, null]);

  useEffect(() => () => cancelRef.current?.(), []);

  const paint = (q: Quad) => {
    q.forEach((p, i) => {
      const el = handleRefs.current[i];
      if (el) {
        el.style.left = pct(p.x);
        el.style.top = pct(p.y);
      }
    });
    outlineRef.current?.setAttribute('points', outlinePoints(q));
    dimRef.current?.setAttribute('d', dimPath(q));
  };

  // The loupe, on touch only: a finger covers the very point it places (a mouse pointer does not).
  const paintLoupe = (q: Quad, index: number, client: { x: number; y: number }, rect: DOMRect) => {
    const loupe = loupeRef.current;
    if (!loupe) return;
    const at = placeLoupe(client, { width: window.innerWidth, height: window.innerHeight });
    const view = loupeView(q[index], [q[(index + 1) % 4], q[(index + 3) % 4]], rect);
    loupe.style.left = `${at.left}px`;
    loupe.style.top = `${at.top}px`;
    loupe.style.backgroundSize = view.backgroundSize;
    loupe.style.backgroundPosition = view.backgroundPosition;
    view.edges.forEach((edge, i) => {
      const line = loupeEdgeRefs.current[i];
      if (!line) return;
      line.setAttribute('x1', String(edge.x1));
      line.setAttribute('y1', String(edge.y1));
      line.setAttribute('x2', String(edge.x2));
      line.setAttribute('y2', String(edge.y2));
    });
    loupe.hidden = false;
  };
  const hideLoupe = () => {
    if (loupeRef.current) loupeRef.current.hidden = true;
  };

  const handleStart = (index: number) => (event: GestureEvent) => {
    const frame = frameRef.current;
    if (!frame) return;
    if (event.cancelable) event.preventDefault();
    cancelRef.current?.();
    const rect = frame.getBoundingClientRect();
    const start = quad;
    const touch = 'touches' in event && !!event.touches;
    const restore = () => paint(start);
    if (touch) paintLoupe(start, index, clientPoint(event), rect);
    // The corner stops where the shape would turn invalid (a bow tie, a dent, a sliver): the outline
    // only ever shows a usable quad, and release commits the last one.
    let lastValid = start;

    cancelRef.current = startGesture<{ quad: Quad; client: { x: number; y: number } }>({
      computePatch: (moveEvent) => {
        if ('touches' in moveEvent && moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
        const c = clientPoint(moveEvent);
        const point = clampPoint({
          x: rect.width ? (c.x - rect.left) / rect.width : start[index].x,
          y: rect.height ? (c.y - rect.top) / rect.height : start[index].y,
        });
        const candidate = start.map((p, i) => (i === index ? point : p)) as Quad;
        if (usable(candidate)) lastValid = candidate;
        return { quad: lastValid, client: c };
      },
      writeDOM: (patch) => {
        paint(patch.quad);
        if (touch) paintLoupe(patch.quad, index, patch.client, rect);
      },
      commit: (patch) => {
        cancelRef.current = null;
        hideLoupe();
        if (!patch) return;
        if (patch.quad !== start) onCommit(patch.quad);
        else restore();
      },
      cancel: () => {
        cancelRef.current = null;
        hideLoupe();
        restore();
      },
    });
  };

  const handleKeyDown = (index: number) => (event: KeyboardEvent) => {
    const dir = ARROWS[event.key];
    if (!dir) return;
    event.preventDefault();
    const step = event.shiftKey ? STEP_SHIFT : STEP;
    const point = clampPoint({ x: quad[index].x + dir[0] * step, y: quad[index].y + dir[1] * step });
    const next = quad.map((p, i) => (i === index ? point : p)) as Quad;
    if (usable(next)) onCommit(next);
  };

  return (
    <div
      class={styles['frame']}
      ref={frameRef}
      data-corner-frame
      style={aspect ? { aspectRatio: String(aspect), width: `min(100%, calc(var(--scan-view-h, 62svh) * ${aspect}))` } : undefined}
    >
      <img class={styles['photo']} src={src} alt="" draggable={false} />
      <svg class={styles['overlay']} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        <path ref={dimRef} class={styles['dim']} d={dimPath(quad)} fill-rule="evenodd" />
        <polygon
          ref={outlineRef}
          class={styles['outline']}
          points={outlinePoints(quad)}
          fill="none"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      {/* Fixed to the viewport, so a phone's edges, not the frame's, decide where it fits (loupe.ts). */}
      <div
        ref={loupeRef}
        class={styles.loupe}
        data-loupe
        hidden
        aria-hidden="true"
        style={{ width: `${LOUPE_SIZE}px`, height: `${LOUPE_SIZE}px`, backgroundImage: `url("${src}")` }}
      >
        <svg class={styles['loupe-lines']} viewBox={`0 0 ${LOUPE_SIZE} ${LOUPE_SIZE}`} width={LOUPE_SIZE} height={LOUPE_SIZE}>
          <line ref={(el) => { loupeEdgeRefs.current[0] = el; }} class={styles['loupe-edge']} stroke-width="2" />
          <line ref={(el) => { loupeEdgeRefs.current[1] = el; }} class={styles['loupe-edge']} stroke-width="2" />
          <path class={styles['loupe-cross']} d={`M${LOUPE_SIZE / 2 - 12} ${LOUPE_SIZE / 2}H${LOUPE_SIZE / 2 + 12}M${LOUPE_SIZE / 2} ${LOUPE_SIZE / 2 - 12}V${LOUPE_SIZE / 2 + 12}`} stroke-width="1.5" />
        </svg>
      </div>
      <div role="group" aria-label={labels.group}>
        {quad.map((p, i) => (
          <button
            key={i}
            type="button"
            class={styles['handle']}
            ref={(el) => { handleRefs.current[i] = el; }}
            style={{ left: pct(p.x), top: pct(p.y) }}
            aria-label={labels.corners[i]}
            onMouseDown={handleStart(i)}
            onTouchStart={handleStart(i)}
            onKeyDown={handleKeyDown(i)}
          >
            <span class={styles['ring']} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
