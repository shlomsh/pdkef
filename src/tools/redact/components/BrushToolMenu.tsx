import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import Popover from '#shell/Popover.tsx';
import toolbarStyles from '#editor-ui/SignToolbar.module.css';
import styles from './BrushControls.module.css';

const CLOSE_DELAY_MS = 180;

/**
 * RED-70: Box / Brush as a submenu of its own tool, so with a mouse nothing stays
 * over the document while drawing. It opens on hover or keyboard focus and shuts
 * when the pointer or focus leaves, or on a press of the tool itself: that press
 * means the person is about to draw. ArrowDown takes the keyboard in, because the
 * portaled menu is not next in tab order.
 *
 * The Popover hangs from a span that takes no clicks: its own click toggle would
 * fight the button's arm and double-click gestures.
 */
export default function BrushToolMenu({ children, controls }: {
  children: ComponentChildren;
  controls: () => ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const keepOpen = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const close = () => {
    clearTimeout(closeTimer.current);
    setOpen(false);
  };
  const scheduleClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      // The colour picker's own popover is portaled outside this panel, so a
      // pointer inside it has left here without leaving the menu.
      if (document.querySelectorAll('[data-editor-popover]').length < 2) setOpen(false);
    }, CLOSE_DELAY_MS);
  };
  const openOnKeyboardFocus = (e: FocusEvent) => {
    if ((e.target as HTMLElement).matches(':focus-visible')) keepOpen();
  };
  const enterMenu = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' || !open) return;
    e.preventDefault();
    panel.current?.querySelector<HTMLElement>('[role="radio"]')?.focus();
  };

  return (
    <div
      className={toolbarStyles.dropdown}
      onMouseEnter={keepOpen}
      onMouseLeave={scheduleClose}
      onFocusIn={openOnKeyboardFocus}
      onFocusOut={scheduleClose}
      onClick={close}
      onKeyDown={enterMenu}
    >
      {children}
      <Popover
        open={open}
        onOpenChange={setOpen}
        placement="bottom-start"
        trigger={<span className={styles.anchor} />}
        content={(
          <div
            ref={panel}
            onMouseEnter={keepOpen}
            onMouseLeave={scheduleClose}
            onFocusIn={keepOpen}
            onFocusOut={scheduleClose}
          >
            {controls()}
          </div>
        )}
      />
    </div>
  );
}
