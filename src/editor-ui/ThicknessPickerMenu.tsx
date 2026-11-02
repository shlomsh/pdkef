import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import Popover from '#shell/Popover.tsx';
import styles from './EditorControls.module.css';

const THICKNESS_OPTIONS: readonly number[] = [1, 2, 3, 5, 8, 12, 16];

export default function ThicknessPickerMenu({ value, onChange, title, options = THICKNESS_OPTIONS, itemTitle = (n) => `${n}px thickness`, trigger = 'line', triggerClass, children }: {
  value?: number;
  onChange: (thickness: number) => void;
  title?: string;
  options?: readonly number[];
  itemTitle?: (thickness: number) => string;
  /** The trigger's glyph: the current line (default) or a small chevron. */
  trigger?: 'line' | 'caret';
  /** A caller's own face for the trigger (replacing the glyph) and its class; the title then names the button. */
  triggerClass?: string;
  children?: ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const currentThickness = value || (options.includes(3) ? 3 : options[0]);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom"
      trigger={
        <button
          type="button"
          className={triggerClass ?? styles['element-button']}
          title={title}
          aria-label={children ? title : undefined}
          aria-haspopup="true"
          aria-expanded={open}
        >
          {children ? children : trigger === 'caret' ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={currentThickness} stroke-linecap="round">
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
          )}
        </button>
      }
      content={
        <div className={`${styles.popover} ${styles['thickness-menu']}`} role="menu">
          <div className={styles['thickness-menu-list']}>
            {options.map(thickness => (
              <button
                key={thickness}
                type="button"
                // Selected state uses a class (not an inline background) so the
                // .sign-menu-item:hover rule isn't overridden by an inline style —
                // that's what killed the hover feedback before.
                className={`${styles['menu-item']} ${styles['thickness-item']}${thickness === currentThickness ? ` ${styles['is-selected']}` : ''}`}
                data-editor-thickness={thickness}
                onClick={() => {
                  onChange(thickness);
                  setOpen(false);
                }}
                title={itemTitle(thickness)}
              >
                <svg width="100%" height="14" viewBox="0 0 100 14" fill="currentColor">
                  <rect x="10" y={7 - thickness / 2} width="80" height={thickness} rx={thickness > 4 ? 2 : 0} />
                </svg>
              </button>
            ))}
          </div>
        </div>
      }
    />
  );
}
