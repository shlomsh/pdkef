import type { ComponentChildren, JSX } from 'preact';
import { X } from 'lucide-preact';
import styles from './DoneStrip.module.css';

export interface DoneStripProps extends Omit<JSX.HTMLAttributes<HTMLElement>, 'class' | 'className' | 'label' | 'children'> {
  label: string;
  closeLabel: string;
  onClose(): void;
  className?: string;
  children?: ComponentChildren;
}

/**
 * The done state pinned under a sticky toolbar card (its positioned parent):
 * a labelled section with a close button, the tool's own rows as children.
 * Shared by Redact and Merge (MERGE-24, 2026-10-23); each tool owns its contents.
 */
export default function DoneStrip({ label, closeLabel, onClose, className, children, ...rest }: DoneStripProps) {
  return (
    <section {...rest} class={className ? `${styles.strip} ${className}` : styles.strip} aria-label={label}>
      <button type="button" class={styles.close} aria-label={closeLabel} onClick={onClose}>
        <X size={18} aria-hidden="true" />
      </button>
      {children}
    </section>
  );
}
