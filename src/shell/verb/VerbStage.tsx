import type { ComponentChildren } from 'preact';
import styles from './paper.module.css';

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
  return (
    <div class={cls} aria-hidden="true">
      {children}
      <span class={styles.floor} />
    </div>
  );
}
