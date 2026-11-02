import Popover from '#shell/Popover.tsx';
import ColorWheelInput from '#editor-ui/ColorWheelInput.tsx';
import HighlightSwatches from '#editor-ui/highlight/HighlightSwatches.tsx';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import controls from '#editor-ui/EditorControls.module.css';
import { MORE_COLORS, isTopColor } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import styles from './MoreColors.module.css';

/** The shared swatches in a box that sizes them as the panel's targets; the box adds no layout of its own. */
export function ColorCells({ colors, color, onChange }: { colors: readonly { id: string; hex: string }[]; color: string; onChange(color: string): void }) {
  return (
    <span class={styles.cells}>
      <HighlightSwatches colors={colors} divider={false} color={color} t={englishSignMessages} onChange={({ color: next }) => onChange(next)} />
    </span>
  );
}

interface MoreColorsProps {
  color: string;
  /** A pick; the popover closes after it. */
  onPick(color: string): void;
  open: boolean;
  onOpenChange(open: boolean): void;
}

/**
 * The colors behind the top three: orange, red, blue and the color wheel, in a popover. The button wears a
 * quiet caret, or, when the color in force is one of these (or a custom one), that color as a pressed swatch.
 */
export default function MoreColors({ color, onPick, open, onOpenChange }: MoreColorsProps) {
  const hidden = !isTopColor(color);
  const pick = (next: string) => { onPick(next); onOpenChange(false); };
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      placement="bottom"
      trigger={
        <button
          type="button" data-more-colors class={styles.more} aria-label={t.moreColors} title={t.moreColors}
          aria-haspopup="true" aria-expanded={open} aria-pressed={hidden ? true : undefined}
        >
          {hidden ? (
            <i class={styles.dot} style={{ background: color }} />
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </button>
      }
      content={
        <div class={`${controls.popover} ${styles.menu}`} data-more-popover role="group" aria-label={t.moreColors}>
          <ColorCells colors={MORE_COLORS} color={color} onChange={pick} />
          <ColorWheelInput value={color} label={t.markColorInput} pressed={hidden && !MORE_COLORS.some((c) => c.hex.toLowerCase() === color.toLowerCase())} onCommit={pick} />
        </div>
      }
    />
  );
}
