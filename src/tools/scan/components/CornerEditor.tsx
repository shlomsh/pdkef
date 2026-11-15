import { useEffect, useRef } from 'preact/hooks';
import { startGesture, type GestureEvent } from '#lib/gestures/controller.ts';
import { type Point, type Quad } from '#lib/pageEnhance/quad.ts';
import { clampPoint, isPagelike } from '../lib/quad.ts';
import { LOUPE_SIZE } from '../lib/loupe.ts';
import { clientPoint, showLoupe } from './cornerLoupe.ts';
import { CornerHitPath, CornerPins, STEP, STEP_SHIFT, usePinGesture } from './cornerPins.tsx';
import { CornerTraceDots, CornerTracePath, Lines, dimClip, paintDim, paintSegments, useCornerTrace } from './cornerTrace.tsx';
import styles from './CornerEditor.module.css';

interface CornerEditorProps {
  src: string;
  /** The photo's width over height: the frame takes this shape before the image decodes. */
  aspect?: number;
  quad: Quad;
  /** The page's real border, closed, in this frame; the straight polygon goes faint while it shows. */
  trace?: Point[] | null;
  /** Indexes into `trace` that are points a person pinned. */
  pinned?: readonly number[];
  /** A border point dragged to `at` (0 to 1 of the shown photo), once, on release. Never called for a corner (an index that is a multiple of 16). */
  onPin?(index: number, at: Point): void;
  /** A pin tapped, or removed with Delete or Backspace. */
  onUnpin?(index: number): void;
  onCommit(quad: Quad): void;
  /** Already localized, e.g. corners[0] = 'Top-left corner'; `pin` names a pinned point. */
  labels: { group: string; corners: [string, string, string, string]; pin?: string };
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const pct = (v: number) => `${v * 100}%`;
const dimStyle = (points: Point[]) => ({ clipPath: dimClip(points), WebkitClipPath: dimClip(points) });
/** A quad a page could be: every corner a real page's (isPagelike), and not a sliver (1% of the
 * photo), which would warp to a line. */
const usable = (q: Quad) => {
  let twice = 0;
  for (let i = 0; i < 4; i += 1) twice += q[i].x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * q[i].y;
  return isPagelike(q) && Math.abs(twice) / 2 >= 0.01;
};

// The photo with four draggable corners. Gesture golden rule: a drag moves the
// handle and rewrites the outline straight through refs, and the final quad goes
// to onCommit once, on release. Render always derives from the `quad` prop.
export default function CornerEditor({ src, aspect, quad, trace, pinned, onPin, onUnpin, onCommit, labels }: CornerEditorProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const handleRefs = useRef<(HTMLButtonElement | null)[]>([null, null, null, null]);
  const outlineRef = useRef<SVGGElement | null>(null);
  const dimRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const loupeRef = useRef<HTMLDivElement | null>(null);
  const loupeEdgeRefs = useRef<(SVGLineElement | null)[]>([null, null]);

  useEffect(() => () => cancelRef.current?.(), []);
  const { traceRef, dotsRef, showTrace, hasTrace } = useCornerTrace(trace, outlineRef, dimRef, cancelRef);
  const paint = (q: Quad) => {
    q.forEach((p, i) => {
      const el = handleRefs.current[i];
      if (el) {
        el.style.left = pct(p.x);
        el.style.top = pct(p.y);
      }
    });
    paintSegments(outlineRef.current, q);
    paintDim(dimRef.current, q);
  };

  const pins = usePinGesture({ trace, frameRef, traceRef, dotsRef, dimRef, loupeRef, loupeEdgeRefs, cancelRef, pinned: pinned ?? [], onPin, onUnpin });
  const paintLoupe = (q: Quad, index: number, client: { x: number; y: number }, rect: DOMRect) =>
    showLoupe(loupeRef.current, loupeEdgeRefs.current, q[index], [q[(index + 1) % 4], q[(index + 3) % 4]], client, rect);
  // A drag is over, committed or not: the loupe goes and the trace is the props' to show again.
  const endDrag = () => {
    cancelRef.current = null;
    if (loupeRef.current) loupeRef.current.hidden = true;
    showTrace(true);
  };

  const handleStart = (index: number) => (event: GestureEvent) => {
    const frame = frameRef.current;
    if (!frame) return;
    if (event.cancelable) event.preventDefault();
    cancelRef.current?.();
    const rect = frame.getBoundingClientRect();
    const start = quad;
    const restore = () => paint(start);
    paintLoupe(start, index, clientPoint(event), rect);
    // The corner stops where the shape would turn invalid (a bow tie, a dent, a sliver): the outline
    // only ever shows a usable quad, and release commits the last one.
    let lastValid = start;

    cancelRef.current = startGesture<{ quad: Quad; client: { x: number; y: number }; rect: DOMRect }>({
      computePatch: (moveEvent) => {
        if ('touches' in moveEvent && moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
        const c = clientPoint(moveEvent);
        const now = frame.getBoundingClientRect(); // every move: the photo area may scroll or zoom under a held pointer
        const point = clampPoint({
          x: now.width ? (c.x - now.left) / now.width : start[index].x,
          y: now.height ? (c.y - now.top) / now.height : start[index].y,
        });
        const candidate = start.map((p, i) => (i === index ? point : p)) as Quad;
        if (usable(candidate)) lastValid = candidate;
        return { quad: lastValid, client: c, rect: now };
      },
      writeDOM: (patch) => {
        paint(patch.quad);
        showTrace(false);
        paintLoupe(patch.quad, index, patch.client, patch.rect);
      },
      commit: (patch) => {
        endDrag();
        if (!patch) return;
        if (patch.quad !== start) onCommit(patch.quad);
        else restore();
      },
      cancel: () => {
        endDrag();
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
      style={aspect ? { aspectRatio: String(aspect), width: `calc(min(100%, calc(var(--scan-view-h, 62svh) * ${aspect})) * var(--corner-zoom, 1))` } : undefined}
    >
      <img class={styles['photo']} src={src} alt="" draggable={false} />
      <div ref={dimRef} class={styles['dim']} data-dim aria-hidden="true" style={dimStyle(hasTrace ? trace! : quad)} />
      <svg class={styles['overlay']} aria-hidden="true">
        <g ref={outlineRef} class={hasTrace ? `${styles['outline']} ${styles['outline-faint']}` : styles['outline']} data-outline fill="none">
          <Lines points={quad} width={2} round />
        </g>
        {hasTrace && <CornerTracePath traceRef={traceRef} points={trace!} />}
        {hasTrace && pins.enabled && <CornerHitPath hitRef={pins.hitRef} points={trace!} onStart={(e) => pins.begin(e)} hover={pins.hover} />}
      </svg>
      {hasTrace && pins.enabled && <CornerTraceDots dotsRef={dotsRef} points={trace!} pinned={pinned ?? []} />}
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
      {hasTrace && pins.enabled && (
        <CornerPins trace={trace!} pinned={pinned ?? []} label={labels.pin ?? ''} pinRefs={pins.pinRefs} onStart={pins.begin} onPin={onPin} onUnpin={onUnpin} hover={pins.hover} />
      )}
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
