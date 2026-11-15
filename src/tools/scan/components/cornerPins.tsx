import { useRef } from 'preact/hooks';
import type { Ref } from 'preact';
import { startGesture, type GestureEvent } from '#lib/gestures/controller.ts';
import type { Point } from '#lib/pageEnhance/quad.ts';
import { clampPoint } from '../lib/quad.ts';
import { PIN_PULL } from '../lib/edges/pinPull.ts';
import { clientPoint, showLoupe } from './cornerLoupe.ts';
import { Lines, paintDim, paintSegments } from './cornerTrace.tsx';
import styles from './CornerEditor.module.css';

/** The keyboard steps, as a share of the photo: shared by the corner handles and the pin dots. */
export const STEP = 0.005;
export const STEP_SHIFT = 0.02;
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
/** Four sides of 16 trace points each: a side's first point is its corner. */
const SIDE = 16;
/** A press that travels less than this (screen px) is a tap, not a drag. */
const SLOP = 4;

const pct = (v: number) => `${v * 100}%`;
const isCorner = (index: number) => index % SIDE === 0;
/**
 * The trace with point `index` moved to `at` and its unpinned neighbours on the same side pulled along by `PIN_PULL`,
 * as the re-trace will place them, so nothing jumps on release. Corners, pins and points past a pin stay. @testSeam
 */
export function pulledTrace(trace: Point[], index: number, at: Point, pinned: readonly number[]): Point[] {
  const dx = at.x - trace[index].x;
  const dy = at.y - trace[index].y;
  const out = trace.map((p, i) => (i === index ? at : p));
  for (const dir of [-1, 1]) {
    for (let d = 1; d <= PIN_PULL.length; d += 1) {
      const j = index + dir * d;
      if (j < 0 || j >= trace.length || isCorner(j) || pinned.includes(j)) break;
      out[j] = { x: trace[j].x + dx * PIN_PULL[d - 1], y: trace[j].y + dy * PIN_PULL[d - 1] };
    }
  }
  return out;
}

/**
 * The trace point nearest a press, in screen pixels (the frame is not square). A corner is never
 * pinned: the nearer of its two neighbours on the outline stands in. @testSeam
 */
export function nearestPinIndex(trace: Point[], client: { x: number; y: number }, rect: { left: number; top: number; width: number; height: number }): number {
  const dist = (i: number) => Math.hypot(rect.left + trace[i].x * rect.width - client.x, rect.top + trace[i].y * rect.height - client.y);
  let best = 0;
  for (let i = 1; i < trace.length; i += 1) if (dist(i) < dist(best)) best = i;
  if (!isCorner(best)) return best;
  const prev = (best + trace.length - 1) % trace.length;
  const next = (best + 1) % trace.length;
  return dist(prev) <= dist(next) ? prev : next;
}

interface PinGestureArgs {
  trace: Point[] | null | undefined;
  frameRef: { current: HTMLDivElement | null };
  traceRef: { current: SVGGElement | null };
  dotsRef: { current: HTMLDivElement | null };
  dimRef: { current: HTMLElement | null };
  loupeRef: { current: HTMLDivElement | null };
  loupeEdgeRefs: { current: (SVGLineElement | null)[] };
  cancelRef: { current: (() => void) | null };
  /** Indexes into `trace` a person pinned: a drag never pulls them along. */
  pinned: readonly number[];
  onPin?(index: number, at: Point): void;
  onUnpin?(index: number): void;
}

/** The mouse handlers that show the loupe while the pointer rests on the border or a pin. */
interface Hover { onMouseMove(event: MouseEvent): void; onMouseLeave(event: MouseEvent): void }

interface PinPatch { at: Point; client: { x: number; y: number }; dragged: boolean; rect: DOMRect }

/**
 * Pins: dragging the border (or a pin dot) moves one trace point. Gesture golden rule: the drag
 * rewrites the paths and the dot through refs, and onPin is called once, on release. A press that
 * never moves is a tap: on a dot it unpins, on the border it does nothing.
 */
export function usePinGesture({ trace, frameRef, traceRef, dotsRef, dimRef, loupeRef, loupeEdgeRefs, cancelRef, pinned, onPin, onUnpin }: PinGestureArgs) {
  const hitRef = useRef<SVGGElement | null>(null);
  const pinRefs = useRef(new Map<number, HTMLButtonElement>());
  const enabled = !!onPin && !!trace && trace.length > 0;
  // A touch is followed by emulated mouse events with no mouseleave: they must not leave a loupe up.
  const touchedAt = useRef(0);

  // Mouse only, no drag in progress: the loupe rests on the pointer, photo and crosshair only.
  const hover: Hover = {
    onMouseMove: (event) => {
      const frame = frameRef.current;
      if (!frame || !trace || cancelRef.current || Date.now() - touchedAt.current < 800) return;
      const rect = frame.getBoundingClientRect();
      const client = clientPoint(event);
      if (!rect.width || !rect.height) return;
      const at = clampPoint({ x: (client.x - rect.left) / rect.width, y: (client.y - rect.top) / rect.height });
      showLoupe(loupeRef.current, loupeEdgeRefs.current, at, undefined, client, rect);
    },
    onMouseLeave: () => {
      if (!cancelRef.current && loupeRef.current) loupeRef.current.hidden = true;
    },
  };

  // `index` is the dot's point, or undefined for a press on the border (the nearest point is found then).
  const begin = (event: GestureEvent, index?: number) => {
    const frame = frameRef.current;
    if (!frame || !trace || !onPin) return;
    if (event.cancelable) event.preventDefault();
    if (event.type === 'touchstart') touchedAt.current = Date.now();
    cancelRef.current?.();
    const rect = frame.getBoundingClientRect();
    const startClient = clientPoint(event);
    const at0 = index ?? nearestPinIndex(trace, startClient, rect);
    const home = trace[at0];
    const paint = (points: Point[]) => {
      paintSegments(traceRef.current, points);
      paintSegments(hitRef.current, points);
      for (const child of Array.from(dotsRef.current?.children ?? []) as HTMLElement[]) {
        const p = points[Number(child.dataset.dot)];
        child.style.left = pct(p.x);
        child.style.top = pct(p.y);
      }
      paintDim(dimRef.current, points);
      const dot = pinRefs.current.get(at0);
      if (dot) {
        dot.style.left = pct(points[at0].x);
        dot.style.top = pct(points[at0].y);
      }
    };
    const end = () => {
      cancelRef.current = null;
      if (loupeRef.current) loupeRef.current.hidden = true;
    };
    const restore = () => paint(trace);
    let dragged = false;

    cancelRef.current = startGesture<PinPatch>({
      computePatch: (moveEvent) => {
        if ('touches' in moveEvent && moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
        const c = clientPoint(moveEvent);
        // Read on every move: the photo area may scroll or zoom under a held pointer.
        const now = frame.getBoundingClientRect();
        if (!dragged && Math.hypot(c.x - startClient.x, c.y - startClient.y) >= SLOP) dragged = true;
        const at = dragged && now.width && now.height
          ? clampPoint({ x: (c.x - now.left) / now.width, y: (c.y - now.top) / now.height })
          : home;
        return { at, client: c, dragged, rect: now };
      },
      writeDOM: (patch) => {
        const points = pulledTrace(trace, at0, patch.at, pinned);
        paint(points);
        showLoupe(loupeRef.current, loupeEdgeRefs.current, patch.at, undefined, patch.client, patch.rect);
      },
      commit: (patch) => {
        end();
        if (patch?.dragged && (patch.at.x !== home.x || patch.at.y !== home.y)) {
          onPin(at0, patch.at);
          return;
        }
        restore();
        if (!patch?.dragged && index !== undefined) onUnpin?.(index);
      },
      cancel: () => {
        end();
        restore();
      },
    });
  };

  return { enabled, hitRef, pinRefs, begin, hover };
}

/** The invisible, wide stroke along the trace that takes a press anywhere on the border. */
export function CornerHitPath({ hitRef, points, onStart, hover }: { hitRef: Ref<SVGGElement>; points: Point[]; onStart(event: GestureEvent): void; hover: Hover }) {
  return (
    <g
      ref={hitRef}
      class={styles['hit']}
      data-hit
      fill="none"
      stroke-width="28"
      onMouseDown={onStart}
      onTouchStart={onStart}
      onMouseMove={hover.onMouseMove}
      onMouseLeave={hover.onMouseLeave}
    >
      <Lines points={points} width={28} />
    </g>
  );
}

interface CornerPinsProps {
  trace: Point[];
  pinned: readonly number[];
  label: string;
  pinRefs: { current: Map<number, HTMLButtonElement> };
  onStart(event: GestureEvent, index: number): void;
  onPin?(index: number, at: Point): void;
  onUnpin?(index: number): void;
  hover: Hover;
}

/** One small round button per pinned point: drag moves it, tap or Delete removes it, arrows nudge it. */
export function CornerPins({ trace, pinned, label, pinRefs, onStart, onPin, onUnpin, hover }: CornerPinsProps) {
  const keyDown = (index: number) => (event: KeyboardEvent) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onUnpin?.(index);
      return;
    }
    const dir = ARROWS[event.key];
    if (!dir) return;
    event.preventDefault();
    const step = event.shiftKey ? STEP_SHIFT : STEP;
    onPin?.(index, clampPoint({ x: trace[index].x + dir[0] * step, y: trace[index].y + dir[1] * step }));
  };
  return (
    <>
      {pinned.filter((i) => !isCorner(i) && trace[i]).map((i) => (
        <button
          key={i}
          type="button"
          class={styles['pin']}
          data-pin={i}
          ref={(el) => {
            if (el) pinRefs.current.set(i, el);
            else pinRefs.current.delete(i);
          }}
          style={{ left: pct(trace[i].x), top: pct(trace[i].y) }}
          aria-label={label}
          onMouseDown={(e) => onStart(e, i)}
          onTouchStart={(e) => onStart(e, i)}
          onMouseMove={hover.onMouseMove}
          onMouseLeave={hover.onMouseLeave}
          onKeyDown={keyDown(i)}
        >
          <span class={styles['pin-dot']} aria-hidden="true" />
        </button>
      ))}
    </>
  );
}
