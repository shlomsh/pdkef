import { HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import styles from '../EditorControls.module.css';
import { highlightColorNames } from './highlightColorNames.ts';

/** SIGN-46: the highlighter's colors (six, or a subset) as round swatches (no thickness: the band follows the text line). */
export default function HighlightSwatches({ color, onChange, t, colors = HIGHLIGHT_COLORS, divider = true, radio = false }: {
  color: string;
  onChange: (changes: { color: string }) => void;
  t: SignMessages;
  /** A subset of the six, in the order to show them. */
  colors?: readonly { id: string; hex: string }[];
  /** The trailing divider; a host that lays out its own row leaves it out. */
  divider?: boolean;
  /** Radios of one group (the host supplies the radiogroup) instead of toggle buttons. */
  radio?: boolean;
}) {
  const names = highlightColorNames(t);
  const anyChecked = colors.some((c) => c.hex === color);
  return (
    <>
      {colors.map(({ id, hex }, index) => (
        <button
          key={id}
          type="button"
          data-highlight-swatch
          className={`${styles['color-swatch']} ${color === hex ? styles.active : ''}`}
          style={{ background: hex }}
          aria-label={names[hex]}
          {...(radio
            ? { role: 'radio', 'aria-checked': color === hex, tabIndex: color === hex || (!anyChecked && index === 0) ? 0 : -1 }
            : { 'aria-pressed': color === hex })}
          title={names[hex]}
          onClick={() => onChange({ color: hex })}
        />
      ))}
      {divider && <div className={styles.divider} />}
    </>
  );
}
