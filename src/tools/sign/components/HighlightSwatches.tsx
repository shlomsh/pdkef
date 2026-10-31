import { HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import styles from '#editor-ui/EditorControls.module.css';

/** SIGN-42: the highlighter's six colors as round swatches (no thickness: the band follows the text line). */
export default function HighlightSwatches({ color, onChange, t }: { color: string; onChange: (changes: { color: string }) => void; t: SignMessages }) {
  return (
    <>
      {HIGHLIGHT_COLORS.map(({ id, hex }) => {
        const name = t[`highlightColor${id[0].toUpperCase()}${id.slice(1)}` as keyof SignMessages] as string;
        return (
          <button
            key={id}
            type="button"
            data-highlight-swatch
            className={`${styles['color-swatch']} ${color === hex ? styles.active : ''}`}
            style={{ background: hex }}
            aria-label={name}
            aria-pressed={color === hex}
            title={name}
            onClick={() => onChange({ color: hex })}
          />
        );
      })}
      <div className={styles.divider} />
    </>
  );
}
