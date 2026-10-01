import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { ComponentChildren, RefObject } from 'preact';
import styles from './RedactBoxBar.module.css';

// Asked as "is this a mouse?" - the same query ArmHint gates its hover tooltip
// on - so anything that is not a fine, hovering pointer gets the fixed bar.
const FINE_QUERY = '(hover: hover) and (pointer: fine)';

/** Reactive `(pointer: coarse)`. False where matchMedia is missing. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia && !window.matchMedia(FINE_QUERY).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia?.(FINE_QUERY);
    if (!mql) return undefined;
    const onChange = () => setCoarse(!mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);
  return coarse;
}

/**
 * The selected box's controls, fixed to the bottom of the viewport (portalled
 * to document.body). Mounted only while the box is selected, so on mount it
 * scrolls the box minimally into view if the bar would cover its bottom edge.
 */
export default function RedactBoxBar({ boxRef, children }: {
  boxRef: RefObject<HTMLElement>;
  children: ComponentChildren;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const bar = barRef.current;
    const box = boxRef.current;
    if (!bar || !box) return;
    const viewportBottom = window.visualViewport?.height ?? window.innerHeight;
    if (box.getBoundingClientRect().bottom > viewportBottom - bar.offsetHeight) {
      box.scrollIntoView?.({ block: 'nearest' });
    }
  }, []);
  return createPortal(
    <div
      ref={barRef}
      className={styles.bar}
      data-editor-actions
      data-redact-box-bar
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
