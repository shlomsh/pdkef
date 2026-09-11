import { useEffect, useRef, useState } from 'preact/hooks';
import { startGesture } from '../editor/gestures/controller.ts';
import styles from './CompareSlider.module.css';

interface CompareSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
}

function getClientX(event: any): number {
  if (event.touches && event.touches.length) return event.touches[0].clientX;
  if (event.changedTouches && event.changedTouches.length) return event.changedTouches[0].clientX;
  return event.clientX;
}

const ARROW_STEP = 5;

// A before/after reveal slider for the Compress tool (SEO-25). Built on the
// same "imperative-during, commit-on-release" gesture controller Sign and
// Redact use for drag/resize/create (src/editor/gestures/controller.ts) -
// see CLAUDE.md's gesture golden rule (Part II §1.2/§4). During the drag the
// handle position is written straight to a CSS custom property on the
// container (no Preact state per frame); the final position commits to
// state exactly once, on release. `scripts/check-gesture-golden-rule.js`
// enforces this statically by scanning every `computePatch` body.
export default function CompareSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Original',
  afterLabel = 'Compressed',
}: CompareSliderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(50);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelRef.current?.(), []);

  const clampPercent = (clientX: number, rect: DOMRect, fallback: number) => {
    if (!rect.width) return fallback;
    const raw = ((clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, raw));
  };

  const writeDOM = (percent: number) => {
    containerRef.current?.style.setProperty('--reveal', `${percent}%`);
  };

  const handleStart = (event: any) => {
    const container = containerRef.current;
    if (!container) return;
    if (event.cancelable) event.preventDefault();
    const rect = container.getBoundingClientRect();
    const committedAtStart = position;

    cancelRef.current?.();
    const startPercent = clampPercent(getClientX(event), rect, committedAtStart);
    writeDOM(startPercent);

    cancelRef.current = startGesture({
      computePatch: (moveEvent: any) => {
        if (moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
        return clampPercent(getClientX(moveEvent), rect, startPercent);
      },
      writeDOM,
      commit: (patch) => {
        cancelRef.current = null;
        setPosition(patch !== undefined ? patch : startPercent);
      },
      cancel: () => {
        cancelRef.current = null;
        writeDOM(committedAtStart);
      },
    });
  };

  const handleKeyDown = (event: any) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setPosition((p) => Math.max(0, p - ARROW_STEP));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setPosition((p) => Math.min(100, p + ARROW_STEP));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setPosition(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setPosition(100);
    }
  };

  return (
    <div ref={containerRef} class={styles['compare-slider']} style={{ '--reveal': `${position}%` } as any}>
      <img class={styles['compare-image']} src={beforeSrc} alt={`${beforeLabel} - page 1`} draggable={false} />
      <div class={styles['compare-after']}>
        <img class={styles['compare-image']} src={afterSrc} alt={`${afterLabel} - page 1`} draggable={false} />
      </div>

      <span class={`${styles['compare-tag']} ${styles['compare-tag-after']}`}>{afterLabel}</span>
      <span class={`${styles['compare-tag']} ${styles['compare-tag-before']}`}>{beforeLabel}</span>

      <div
        class={styles['compare-handle']}
        role="slider"
        tabIndex={0}
        aria-label="Compare original and compressed page 1"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        onMouseDown={handleStart}
        onTouchStart={handleStart}
        onKeyDown={handleKeyDown}
      >
        <span class={styles['compare-handle-grip']} aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="8 7 3 12 8 17" />
            <polyline points="16 7 21 12 16 17" />
          </svg>
        </span>
      </div>
    </div>
  );
}
