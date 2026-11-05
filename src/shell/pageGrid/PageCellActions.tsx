import type { ComponentChildren } from 'preact';
import styles from './PageCellActions.module.css';

/** Class names a grid applies itself: `host` on the cell `<li>`, and
 * `action` / `glyph` / `tip` on a control that is not a PageCellButton (a link). */
export const cellActionStyles = styles;

/** The hover cluster above a page cell: revealed on hover or focus (pointer
 * devices), or on the one tapped page (a phone). The cell carries `host`. */
export function PageCellActions({ children }: { children: ComponentChildren }) {
  return <span class={styles.actions}>{children}</span>;
}

export function PageCellButton({ label, tip, pressed, onClick, children }: {
  label: string;
  tip: string;
  pressed?: boolean;
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <button type="button" class={styles.action} aria-label={label} aria-pressed={pressed} onClick={onClick}>
      {/* The visual chrome (border, background, shadow) lives on this
          inner span, not the button: on touch (a selected cell, coarse
          pointer) the button's own box grows to a real 44x44 - a rect
          measurement, not only elementFromPoint, must read 44 - while
          this glyph stays visually 32, centred inside it by padding.
          Pointer devices are unchanged: the button stays 32x32 and the
          44x44 hit area is the `::before` in the stylesheet, as before. */}
      <span class={styles.glyph} aria-hidden="true">{children}</span>
      {/* A `title` attribute is not a visible tooltip. This span carries the
          short word, hidden until the button is hovered or keyboard-focused;
          the aria-label above stays the real accessible name so a screen
          reader is never told the word twice. */}
      <span class={styles.tip} data-tip aria-hidden="true">{tip}</span>
    </button>
  );
}
