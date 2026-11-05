import { useEffect, useRef } from 'preact/hooks';
import { startGesture, type GestureEvent } from '#lib/gestures/controller.ts';
import type { Spine } from '#lib/pageEnhance/spine.ts';
import styles from './SplitLine.module.css';

interface SplitLineProps {
  src: string;
  /** The photo's width over height: the frame takes this shape before the image decodes. */
  aspect?: number;
  spine: Spine;
  onCommit(spine: Spine): void;
  /** Already localized. */
  labels: { group: string; top: string; bottom: string };
}

type End = 'top' | 'bottom';
const ENDS: End[] = ['top', 'bottom'];
const STEP = 0.005;
const STEP_SHIFT = 0.02;
const MIN_X = 0.02;
const MAX_X = 0.98;

const pct = (v: number) => `${v * 100}%`;
const clampX = (x: number) => Math.min(MAX_X, Math.max(MIN_X, x));
/** The line with one end moved sideways; the ends never leave the photo. @testSeam */
export const movedSpine = (spine: Spine, end: End, x: number): Spine => ({ ...spine, [end]: clampX(x) });

function clientX(event: GestureEvent): number {
  const t = ('touches' in event ? (event.touches?.[0] ?? event.changedTouches?.[0]) : undefined) ?? (event as MouseEvent);
  return t.clientX;
}

// The photo with one straight line and a handle at each end that moves only sideways. Gesture golden
// rule: a drag moves the handle and the line through refs, and the final spine goes to onCommit once.
export default function SplitLine({ src, aspect, spine, onCommit, labels }: SplitLineProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const handleRefs = useRef<(HTMLButtonElement | null)[]>([null, null]);
  const lineRef = useRef<SVGLineElement | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelRef.current?.(), []);

  const paint = (s: Spine) => {
    ENDS.forEach((end, i) => {
      const el = handleRefs.current[i];
      if (el) el.style.left = pct(s[end]);
    });
    lineRef.current?.setAttribute('x1', String(s.top));
    lineRef.current?.setAttribute('x2', String(s.bottom));
  };

  const handleStart = (end: End) => (event: GestureEvent) => {
    const frame = frameRef.current;
    if (!frame) return;
    if (event.cancelable) event.preventDefault();
    cancelRef.current?.();
    const rect = frame.getBoundingClientRect();
    const start = spine;
    cancelRef.current = startGesture<Spine>({
      computePatch: (moveEvent) => {
        if ('touches' in moveEvent && moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
        return movedSpine(start, end, rect.width ? (clientX(moveEvent) - rect.left) / rect.width : start[end]);
      },
      writeDOM: paint,
      commit: (patch) => {
        cancelRef.current = null;
        if (!patch) return;
        if (patch[end] !== start[end]) onCommit(patch);
        else paint(start);
      },
      cancel: () => {
        cancelRef.current = null;
        paint(start);
      },
    });
  };

  const handleKeyDown = (end: End) => (event: KeyboardEvent) => {
    const dir = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!dir) return;
    event.preventDefault();
    onCommit(movedSpine(spine, end, spine[end] + dir * (event.shiftKey ? STEP_SHIFT : STEP)));
  };

  return (
    <div
      class={styles['frame']}
      ref={frameRef}
      data-split-frame
      style={aspect ? { aspectRatio: String(aspect), width: `min(100%, calc(var(--scan-view-h, 62svh) * ${aspect}))` } : undefined}
    >
      <img class={styles['photo']} src={src} alt="" draggable={false} />
      <svg class={styles['overlay']} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        <line
          ref={lineRef}
          class={styles['line']}
          x1={spine.top}
          y1="0"
          x2={spine.bottom}
          y2="1"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <div role="group" aria-label={labels.group}>
        {ENDS.map((end, i) => (
          <button
            key={end}
            type="button"
            class={styles['handle']}
            ref={(el) => { handleRefs.current[i] = el; }}
            style={{ left: pct(spine[end]), top: end === 'top' ? '0%' : '100%' }}
            aria-label={labels[end]}
            onMouseDown={handleStart(end)}
            onTouchStart={handleStart(end)}
            onKeyDown={handleKeyDown(end)}
          >
            <span class={styles['ring']} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
