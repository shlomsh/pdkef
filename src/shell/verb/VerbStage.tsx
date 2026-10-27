import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import styles from './paper.module.css';
import { createReplayer, isHover } from './replay';

interface VerbStageProps {
  children?: ComponentChildren;
  class?: string;
}

/**
 * The shared stage for a tool's hero verb. Decorative only: hidden from assistive tech.
 * All geometry inside is in base pixels times --u (see paper.module.css), so the verb
 * scales with the box at any width.
 */
export default function VerbStage({ children, class: className }: VerbStageProps) {
  const cls = className ? `${styles.box} ${className}` : styles.box;
  const ref = useRef<HTMLDivElement>(null);

  // Replay on a mouse entering the sheet, and when the tab is shown again. The keyframes do not
  // exist under reduced motion, so there is nothing to replay; bail early anyway.
  useEffect(() => {
    const box = ref.current;
    if (!box || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const replay = createReplayer(() => box.getAnimations({ subtree: true }));
    const sheet = box.closest('[data-empty-state]');
    const onEnter = (e: Event) => {
      if (isHover(e as PointerEvent)) replay();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') replay();
    };
    sheet?.addEventListener('pointerenter', onEnter);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      sheet?.removeEventListener('pointerenter', onEnter);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <div class={cls} aria-hidden="true" ref={ref}>
      {children}
      <span class={styles.floor} />
    </div>
  );
}
