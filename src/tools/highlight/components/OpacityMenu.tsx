import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import Popover from '#shell/Popover.tsx';
import controls from '#editor-ui/EditorControls.module.css';
import { englishHighlightMessages as t } from '../messages.ts';
import OpacitySlider from './OpacitySlider.tsx';
import styles from './OpacityMenu.module.css';

/** The button that opens the opacity slider: a quiet caret, or the caller's own face (`children`, styled by `triggerClass`). */
export default function OpacityMenu({ value, onChange, triggerClass, children }: { value: number; onChange(opacity: number): void; triggerClass?: string; children?: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom"
      trigger={
        <button type="button" class={triggerClass ?? controls['element-button']} title={t.markOpacityMenu} aria-label={children ? t.markOpacityMenu : undefined} aria-haspopup="true" aria-expanded={open}>
          {children ?? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>}
        </button>
      }
      content={
        <div class={`${controls.popover} ${styles.menu}`}>
          <OpacitySlider value={value} onChange={onChange} />
        </div>
      }
    />
  );
}
