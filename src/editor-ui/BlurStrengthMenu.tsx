import { useState } from 'preact/hooks';
import Popover from '../shell/Popover.tsx';
import { BLUR_STRENGTHS, resolveBlurStrength, type BlurStrength } from '../editor/model/blurStrength.ts';
import styles from './EditorControls.module.css';

export default function BlurStrengthMenu({
  value,
  onChange,
  title,
  labels,
}: {
  value?: BlurStrength;
  onChange: (strength: BlurStrength) => void;
  title: string;
  labels: { [K in BlurStrength]: string };
}) {
  const [open, setOpen] = useState(false);
  const current = resolveBlurStrength(value);

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
          data-editor-blur-strength-trigger
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2c4 5 7 8.5 7 12.5a7 7 0 1 1-14 0C5 10.5 8 7 12 2Z" />
          </svg>
        </button>
      }
      content={
        <div className={`${styles.popover} ${styles['blur-strength-menu']}`} role="menu">
          <div className={styles['blur-strength-menu-list']}>
            {BLUR_STRENGTHS.map(level => (
              <button
                key={level}
                type="button"
                className={`${styles['menu-item']} ${styles['blur-strength-item']}${level === current ? ` ${styles['is-selected']}` : ''}`}
                data-editor-blur-strength={level}
                onClick={() => {
                  onChange(level);
                  setOpen(false);
                }}
                title={labels[level]}
              >
                {labels[level]}
              </button>
            ))}
          </div>
        </div>
      }
    />
  );
}
