import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { ComponentChildren, RefObject } from 'preact';
import styles from './RedactBoxBar.module.css';
import toolbarStyles from './RedactBoxToolbar.module.css';

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

/** The element to portal into: the fullscreen one when there is one, else body. */
function useHost(): HTMLElement {
  const [, bump] = useState(0);
  useEffect(() => {
    const onChange = () => bump((n) => n + 1);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  return (document.fullscreenElement as HTMLElement | null) ?? document.body;
}

/**
 * The selected box's controls as a light pill fixed to the bottom of the
 * viewport (portalled to the fullscreen element, else document.body). Mounted
 * only while the box is selected, so on mount it scrolls the box minimally
 * into view if the bar would cover its bottom edge.
 */
export default function RedactBoxBar({ boxRef, children }: {
  boxRef: RefObject<HTMLElement>;
  children: ComponentChildren;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const host = useHost();
  useEffect(() => {
    const bar = barRef.current;
    const box = boxRef.current;
    if (!bar || !box) return;
    const barTop = bar.getBoundingClientRect().top;
    if (box.getBoundingClientRect().bottom > barTop - 8) {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      box.style.scrollMarginBottom = `${viewportHeight - barTop + 8}px`;
      box.scrollIntoView?.({ block: 'nearest' });
      box.style.scrollMarginBottom = '';
    }
  }, []);
  return createPortal(
    <div
      ref={barRef}
      className={`${toolbarStyles.pill} ${styles.bar}`}
      data-editor-actions
      data-redact-box-bar
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    host,
  );
}
