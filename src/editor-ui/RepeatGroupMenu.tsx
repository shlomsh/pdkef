import { useState } from 'preact/hooks';
import Popover from '../shell/Popover.tsx';
import styles from './EditorControls.module.css';

/**
 * RED-03: replaces ElementToolbar.tsx's plain "repeat on every page" button
 * once a box is part of a linked set (repeatGroupSize >= 2) - the same
 * stacked-pages icon, now with the set's size next to it, opening a menu of
 * the group-level actions instead of firing the repeat action directly.
 */
export default function RepeatGroupMenu({
  size,
  title,
  heading,
  fillLabel,
  unlinkLabel,
  removeLabel,
  onRepeatOnEveryPage,
  onUnlinkFromGroup,
  onRemoveGroup,
}: {
  size: number;
  title: string;
  heading: string;
  fillLabel: string;
  unlinkLabel: string;
  removeLabel: string;
  onRepeatOnEveryPage?: () => void;
  onUnlinkFromGroup: () => void;
  onRemoveGroup: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom"
      trigger={
        <button
          type="button"
          className={styles['element-button']}
          title={title}
          aria-haspopup="true"
          aria-expanded={open}
          data-editor-repeat-group-trigger
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="6" y="2" width="14" height="16" rx="2" />
            <path d="M4 6v14a2 2 0 0 0 2 2h12" />
          </svg>
          <span className={styles['repeat-group-count']}>{size}</span>
        </button>
      }
      content={
        <div className={`${styles.popover} ${styles['repeat-group-menu']}`} role="menu">
          <div className={styles['repeat-group-heading']}>{heading}</div>
          {onRepeatOnEveryPage && (
            <button
              type="button"
              className={styles['menu-item']}
              data-editor-repeat-group-fill
              onClick={() => {
                onRepeatOnEveryPage();
                setOpen(false);
              }}
            >
              {fillLabel}
            </button>
          )}
          <button
            type="button"
            className={styles['menu-item']}
            data-editor-repeat-group-unlink
            onClick={() => {
              onUnlinkFromGroup();
              setOpen(false);
            }}
          >
            {unlinkLabel}
          </button>
          <button
            type="button"
            className={styles['menu-item']}
            data-editor-repeat-group-remove
            onClick={() => {
              onRemoveGroup();
              setOpen(false);
            }}
          >
            {removeLabel}
          </button>
        </div>
      }
    />
  );
}
