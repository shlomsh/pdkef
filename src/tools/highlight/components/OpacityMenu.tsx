import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import Popover from '#shell/Popover.tsx';
import controls from '#editor-ui/EditorControls.module.css';
import { englishHighlightMessages as t } from '../messages.ts';
import StrokeChoice from './StrokeChoice.tsx';
import type { Marker } from '../lib/marker/markerState.ts';
import OpacitySlider from './OpacitySlider.tsx';
import { COUNTER_SCALE, useToolbarScaled } from './toolbarScale.ts';
import styles from './OpacityMenu.module.css';

/** The button that opens the opacity slider: a quiet caret, or the caller's own face (`children`, styled by `triggerClass`). */
export default function OpacityMenu({ value, onChange, triggerClass, children, look, onLook }: {
  value: number; onChange(opacity: number): void; triggerClass?: string; children?: ComponentChildren;
  /** With `onLook`: the Clean | Sketch | Pencil toggle above the slider. */
  look?: Marker; onLook?(change: Partial<Marker>): void;
}) {
  const [open, setOpen] = useState(false);
  const scaled = useToolbarScaled();
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
        <div class={`${controls.popover} ${styles.menu}`} style={scaled ? COUNTER_SCALE : undefined} data-counter-scaled={scaled || undefined}>
          {look && onLook && <StrokeChoice look={look} onChange={onLook} />}
          <OpacitySlider value={value} onChange={onChange} />
        </div>
      }
    />
  );
}
