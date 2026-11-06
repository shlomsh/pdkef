import Popover from '#shell/Popover.tsx';
import controls from '#editor-ui/EditorControls.module.css';
import { UNDERLINE_WIDTH } from '#editor/model/underlineInk.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import Chevron from './Chevron.tsx';
import OpacitySlider from './OpacitySlider.tsx';
import { onRadioKeyDown, radioTabIndex } from './radioKeys.ts';
import StrokeChoice, { KindChoice, StrokeInk } from './StrokeChoice.tsx';
import { COUNTER_SCALE, useToolbarScaled } from './toolbarScale.ts';
import styles from './LookMenu.module.css';

const THICKNESS_OPTIONS = [1, 1.5, 2, 3, 4];

interface LookMenuProps {
  look: Marker;
  onChange(change: Partial<Marker>): void;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Where the menu opens. */
  placement?: 'top' | 'bottom';
}

/** The underline's thickness: five lines, one tap each. A pick leaves the menu open so a person can compare. */
function ThicknessRow({ look, onChange }: Pick<LookMenuProps, 'look' | 'onChange'>) {
  const current = look.strokeWidth ?? UNDERLINE_WIDTH.default;
  const anyChecked = THICKNESS_OPTIONS.includes(current);
  return (
    <span class={styles.thickness} role="radiogroup" aria-label={t.markThickness} onKeyDown={onRadioKeyDown}>
      {THICKNESS_OPTIONS.map((n, i) => {
        const checked = current === n;
        const name = formatMessage(t.thicknessItem, { n });
        return (
          <button
            key={n} type="button" role="radio" class={styles.thick} data-editor-thickness={n} aria-label={name} title={name}
            aria-checked={checked} tabIndex={radioTabIndex(checked, i, anyChecked)}
            onClick={() => onChange({ style: 'underline', strokeWidth: n })}
          >
            <span class={styles.line} style={{ height: `${n + 4}px` }}>
              <StrokeInk underline sketch={look.stroke === 'sketch'} color="currentColor" width={n} w={36} h={n + 4} seed={n} />
            </span>
          </button>
        );
      })}
    </span>
  );
}

/**
 * The mark's look in one button: its face is the mark as it is drawn now (no number), and the menu holds the kind (Highlight | Underline),
 * the stroke (Clean | Sketch | Pencil) and the strength (a highlight's opacity, an underline's thickness).
 */
export default function LookMenu({ look, onChange, open, onOpenChange, placement = 'bottom' }: LookMenuProps) {
  const scaled = useToolbarScaled();
  const sketch = look.stroke === 'sketch';
  const pencil = look.style === 'pencil';
  const underline = look.style === 'underline';
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      placement={placement}
      trigger={
        <button type="button" class={styles.look} data-look-button title={t.markLook} aria-label={t.markLook} aria-haspopup="true" aria-expanded={open}>
          {underline
            ? (
              <span class={`${styles.face} ${styles.paper}`} data-setting-line data-setting-face>
                <StrokeInk underline sketch={sketch} color="currentColor" width={look.strokeWidth ?? UNDERLINE_WIDTH.default} w={40} h={14} />
              </span>
            )
            : (
              <span class={`${styles.face} ${styles.paper}`} data-setting-face>
                <StrokeInk underline={false} sketch={sketch} pencil={pencil} color={look.color} opacity={look.opacity} w={40} h={16} mark />
              </span>
            )}
          <Chevron up={placement === 'top'} />
        </button>
      }
      content={
        <div class={`${controls.popover} ${styles.menu}`} style={scaled ? COUNTER_SCALE : undefined} data-counter-scaled={scaled || undefined}>
          <KindChoice look={look} onChange={onChange} />
          <StrokeChoice look={look} onChange={onChange} />
          {underline
            ? <ThicknessRow look={look} onChange={onChange} />
            : <OpacitySlider value={look.opacity} onChange={(opacity) => onChange({ style: pencil ? 'pencil' : 'highlight', opacity })} />}
        </div>
      }
    />
  );
}
