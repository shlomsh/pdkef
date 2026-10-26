import { useEffect, useRef } from 'preact/hooks';
import { startGesture } from '../../lib/gestures/controller.ts';
import { clampPoint, isConvexQuad, type Quad } from './quad.ts';
import styles from './CornerEditor.module.css';

interface CornerEditorProps {
  src: string;
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
const outlinePoints = (q: Quad) => q.map((p) => `${p.x},${p.y}`).join(' ');
// The whole photo plus the quad, filled evenodd: dims everything outside the quad.
const dimPath = (q: Quad) => `M0 0H1V1H0Z M${q.map((p) => `${p.x} ${p.y}`).join(' L')} Z`;

function clientPoint(event: any): { x: number; y: number } {
  const t = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
  return { x: t.clientX, y: t.clientY };
}

// The photo with four draggable corners. Gesture golden rule: a drag moves the
// handle and rewrites the outline straight through refs, and the final quad goes
// to onCommit once, on release. Render always derives from the `quad` prop.
export default function CornerEditor({ src, quad, onCommit, labels }: CornerEditorProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const handleRefs = useRef<(HTMLButtonElement | null)[]>([null, null, null, null]);
  const outlineRef = useRef<SVGPolygonElement | null>(null);
  const dimRef = useRef<SVGPathElement | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

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

  const handleStart = (index: number) => (event: any) => {
    const frame = frameRef.current;
    if (!frame) return;
    if (event.cancelable) event.preventDefault();
    cancelRef.current?.();
    const rect = frame.getBoundingClientRect();
    const start = quad;
    const restore = () => paint(start);

    cancelRef.current = startGesture<Quad>({
      computePatch: (moveEvent: any) => {
        if (moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
        const c = clientPoint(moveEvent);
        const point = clampPoint({
          x: rect.width ? (c.x - rect.left) / rect.width : start[index].x,
          y: rect.height ? (c.y - rect.top) / rect.height : start[index].y,
        });
        return start.map((p, i) => (i === index ? point : p)) as Quad;
      },
      writeDOM: paint,
      commit: (patch) => {
        cancelRef.current = null;
        if (!patch) return;
        if (isConvexQuad(patch)) onCommit(patch);
        else restore();
      },
      cancel: () => {
        cancelRef.current = null;
        restore();
      },
    });
  };

  const handleKeyDown = (index: number) => (event: any) => {
    const dir = ARROWS[event.key];
    if (!dir) return;
    event.preventDefault();
    const step = event.shiftKey ? STEP_SHIFT : STEP;
    const point = clampPoint({ x: quad[index].x + dir[0] * step, y: quad[index].y + dir[1] * step });
    const next = quad.map((p, i) => (i === index ? point : p)) as Quad;
    if (isConvexQuad(next)) onCommit(next);
  };

  return (
    <div class={styles['frame']} ref={frameRef} data-corner-frame>
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
