import Popover from '#shell/Popover.tsx';
import ColorWheelInput from '#editor-ui/ColorWheelInput.tsx';
import { highlightColorNames } from '#editor-ui/highlight/highlightColorNames.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import controls from '#editor-ui/EditorControls.module.css';
import { MORE_COLORS, isTopColor } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import { onRadioKeyDown, radioTabIndex } from './radioKeys.ts';
import MarkerArt from './MarkerArt.tsx';
import Chevron from './Chevron.tsx';
import { PANEL_MENU_MIDDLEWARE } from './panelMenuMiddleware.ts';
import { COUNTER_SCALE, useToolbarScaled } from './toolbarScale.ts';
import styles from './MoreColors.module.css';

const names = highlightColorNames(englishSignMessages);

/** The color cells as the panel's targets, each a marker over the ink picked. With a label they are one radio group. */
export function ColorCells({ colors, color, label, onChange }: { colors: readonly { id: string; hex: string }[]; color: string; label?: string; onChange(color: string): void }) {
  const same = (hex: string) => hex.toLowerCase() === color.toLowerCase();
  const anyChecked = colors.some((c) => same(c.hex));
  return (
    <span class={styles.cells} role={label ? 'radiogroup' : undefined} aria-label={label} onKeyDown={label ? onRadioKeyDown : undefined}>
      {colors.map(({ id, hex }, index) => {
        const checked = same(hex);
        return (
          <button
            key={id} type="button" data-highlight-swatch class={styles.cell} aria-label={names[hex]} title={names[hex]}
            {...(label ? { role: 'radio', 'aria-checked': checked, tabIndex: radioTabIndex(checked, index, anyChecked) } : { 'aria-pressed': checked })}
            onClick={() => onChange(hex)}
          >
            <MarkerArt ink={hex} picked={checked} />
          </button>
        );
      })}
    </span>
  );
}

interface MoreColorsProps {
  color: string;
  /** A pick; the popover closes after it. */
  onPick(color: string): void;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Where the popover opens. */
  placement?: 'top' | 'bottom';
}

/**
 * The colors behind the top three: orange, red, blue and the color wheel, in a popover. The button wears a
 * chevron, with, when the color in force is one of these (or a custom one), that color's ink band before it.
 */
export default function MoreColors({ color, onPick, open, onOpenChange, placement = 'bottom' }: MoreColorsProps) {
  const hidden = !isTopColor(color);
  const customInForce = hidden && !MORE_COLORS.some((c) => c.hex.toLowerCase() === color.toLowerCase());
  const scaled = useToolbarScaled();
  const pick = (next: string) => { onPick(next); onOpenChange(false); };
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      placement={placement}
      middleware={PANEL_MENU_MIDDLEWARE}
      trigger={
        <button
          type="button" data-more-colors class={styles.more} aria-label={t.moreColors} title={t.moreColors}
          aria-haspopup="true" aria-expanded={open} aria-pressed={hidden ? true : undefined}
        >
          {hidden && <span class={styles.moreArt} data-more-ink><MarkerArt ink={color} picked /></span>}
          <Chevron up={placement === 'top'} />
        </button>
      }
      content={
        <div class={`${controls.popover} ${styles.menu}`} data-more-popover style={scaled ? COUNTER_SCALE : undefined} data-counter-scaled={scaled || undefined} role="group" aria-label={t.moreColors}>
          <ColorCells colors={MORE_COLORS} color={color} onChange={pick} />
          <ColorWheelInput value={color} label={t.markColorInput} pressed={customInForce} onCommit={pick}>
            <MarkerArt wheel ink={color} picked={customInForce} />
          </ColorWheelInput>
        </div>
      }
    />
  );
}
