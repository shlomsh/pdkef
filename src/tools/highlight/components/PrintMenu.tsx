import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { printMenuItems } from '../lib/print/printMenu.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import styles from './PrintMenu.module.css';

interface PrintMenuProps {
  open: boolean;
  /** Whether the document has a comment; "Print with my notes" is offered only then. */
  withComments: boolean;
  onChoose(withNotes: boolean): void;
  onClose(): void;
  /** The trigger, when there is one in the row; the menu opens under it and its press is not an outside press. */
  children?: ComponentChildren;
  /** 'floating' hangs the menu under the Reading lamp's capsule, whose own Print button is the trigger. */
  placement?: 'trigger' | 'floating';
}

/** READ-06: Print, and Print with my notes. Closes on Esc, on a press outside and on a choice. */
export default function PrintMenu({ open, withComments, onChoose, onClose, children, placement = 'trigger' }: PrintMenuProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const live = useRef({ onClose });
  live.current = { onClose };
  const items = printMenuItems(withComments, t);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: Event) => { if (!rootRef.current?.contains(e.target as Node)) live.current.onClose(); };
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      if (opener?.isConnected && opener !== document.body) opener.focus();
    };
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    const buttons = [...(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step || buttons.length === 0) return;
    e.preventDefault();
    buttons[(buttons.indexOf(e.target as HTMLElement) + step + buttons.length) % buttons.length].focus();
  };

  return (
    <span class={`${styles.wrap} ${placement === 'floating' ? styles.floating : ''}`} ref={rootRef} onKeyDown={onKeyDown}>
      {children}
      {open && (
        <div class={styles.menu} role="menu" aria-label={t.capsule.print}>
          {items.map((item) => (
            <button
              key={item.id} type="button" role="menuitem" class={styles.item}
              onClick={() => { onClose(); onChoose(item.withNotes); }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
