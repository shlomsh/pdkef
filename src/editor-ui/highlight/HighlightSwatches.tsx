import { HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import styles from '../EditorControls.module.css';
import { highlightColorNames } from './highlightColorNames.ts';

/** SIGN-46: the highlighter's six colors as round swatches (no thickness: the band follows the text line). */
export default function HighlightSwatches({ color, onChange, t }: { color: string; onChange: (changes: { color: string }) => void; t: SignMessages }) {
  const names = highlightColorNames(t);
  return (
    <>
      {HIGHLIGHT_COLORS.map(({ id, hex }) => (
        <button
          key={id}
          type="button"
          data-highlight-swatch
          className={`${styles['color-swatch']} ${color === hex ? styles.active : ''}`}
          style={{ background: hex }}
          aria-label={names[hex]}
          aria-pressed={color === hex}
          title={names[hex]}
          onClick={() => onChange({ color: hex })}
        />
      ))}
      <div className={styles.divider} />
    </>
  );
}
