import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { menuLeft } from '../lib/print/menuPlacement.ts';
import { printMenuItems } from '../lib/print/printMenu.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import controls from '#editor-ui/EditorControls.module.css';
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
  /** Floating only: the trigger's box in viewport px (top is where the menu's top edge goes); the menu aligns its start edge to it. */
  anchor?: { top: number; left: number; right: number };
  /** The row's wrapper class (Sign's dropdown), so the toolbar sizes it like its other items. */
  wrapClass?: string;
}

/** READ-06: Print, and Print with my notes. Closes on Esc, on a press outside and on a choice. */
export default function PrintMenu({ open, withComments, onChoose, onClose, children, placement = 'trigger', anchor, wrapClass }: PrintMenuProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const live = useRef({ onClose });
  live.current = { onClose };
  const items = printMenuItems(withComments, t);
  const [left, setLeft] = useState<number | undefined>();
  const floating = placement === 'floating' && anchor !== undefined;

  useLayoutEffect(() => {
    if (!open || !anchor || placement !== 'floating') { setLeft(undefined); return; }
    const menu = rootRef.current?.querySelector<HTMLElement>('[role="menu"]');
    const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
    setLeft(menuLeft({ triggerLeft: anchor.left, triggerRight: anchor.right, menuWidth: menu?.offsetWidth ?? 0, viewportWidth: window.innerWidth, rtl }));
  }, [open, placement, anchor?.top, anchor?.left, anchor?.right]);

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
    <span class={`${styles.wrap} ${placement === 'floating' ? styles.floating : ''} ${wrapClass ?? ''}`} ref={rootRef} onKeyDown={onKeyDown}
      style={floating ? { top: `${anchor.top}px`, left: left === undefined ? undefined : `${left}px`, visibility: open && left === undefined ? 'hidden' : undefined } : undefined}>
      {children}
      {open && (
        <div class={`${controls.popover} ${controls['toolbar-menu']} ${styles.menu}`} role="menu" aria-label={t.capsule.print}>
          {items.map((item) => (
            <button
              key={item.id} type="button" role="menuitem" class={`${controls['menu-item']} ${styles.item}`}
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
