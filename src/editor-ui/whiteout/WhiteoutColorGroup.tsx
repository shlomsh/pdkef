import { Check, Pipette } from 'lucide-preact';
import { swatchInk } from './swatchInk.ts';
import ColorWheelInput from '../ColorWheelInput.tsx';
import styles from './WhiteoutColorGroup.module.css';

/** The group's visible and accessible text, supplied by the host so each edition shows its own language. */
export interface WhiteoutColorLabels {
  group: string;
  auto: string;
  autoTitle: string;
  pipette: string;
  /** Contains {color}. */
  useColorTemplate: string;
  customColor: string;
}

export interface WhiteoutColorGroupProps {
  labels: WhiteoutColorLabels;
  /** The whiteout's colour, '#rrggbb' (anything else reads as white). */
  color: string;
  /** True when the colour follows the page around the box. */
  auto: boolean;
  eyedropping: boolean;
  /** Most recent first, '#rrggbb'. */
  recentColors?: readonly string[];
  onToggleEyedropper: () => void;
  onMatchPage: () => void;
  onPickColor: (color: string) => void;
  /** Paints a colour on the box's DOM only (no state, no undo step): the live preview, and its undo. */
  paintPreview: (color: string) => void;
}

const HEX = /^#[0-9a-f]{6}$/i;

const MAX_RECENTS = 3;

/** The current colour first (when the box is not auto), then the recents: lowercase, deduped, at most three. */
export function shownRecents(current: string | null, recents: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [...(current && HEX.test(current) ? [current] : []), ...recents]) {
    const hex = c.toLowerCase();
    if (!HEX.test(hex) || seen.has(hex)) continue;
    seen.add(hex);
    out.push(hex);
  }
  return out.slice(0, MAX_RECENTS);
}

/** The whiteout colour group: Auto, eyedropper, recent colours and a native colour input. */
export default function WhiteoutColorGroup({
  labels, color, auto, eyedropping, recentColors = [], onToggleEyedropper, onMatchPage, onPickColor, paintPreview,
}: WhiteoutColorGroupProps) {
  const hex = HEX.test(color) ? color : '#ffffff';

  const recents = shownRecents(auto ? null : color, recentColors);

  return (
    <div className={styles.group} role="group" aria-label={labels.group}>
      <button
        type="button"
        className={styles.auto}
        data-whiteout-color-auto
        aria-pressed={auto}
        title={labels.autoTitle}
        onClick={onMatchPage}
      >
        <span className={styles.autoFace}>{labels.auto}</span>
      </button>
      <button
        type="button"
        className={styles.eyedropper}
        data-whiteout-color-eyedropper
        aria-pressed={eyedropping}
        aria-label={labels.pipette}
        title={labels.pipette}
        onClick={onToggleEyedropper}
      >
        <Pipette size={18} />
      </button>
      {recents.map((c) => {
        const pressed = !auto && c === color.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            className={styles.recent}
            data-whiteout-color-recent={c}
            aria-pressed={pressed}
            aria-label={labels.useColorTemplate.replace('{color}', c)}
            title={c}
            onClick={() => onPickColor(c)}
          >
            <span className={styles.recentFace} ref={(el) => { if (el) el.style.setProperty('--swatch', c); }}>
              {pressed && (
                <span className={swatchInk(c) === 'dark' ? styles.inkDark : styles.inkLight}>
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
            </span>
          </button>
        );
      })}
      <ColorWheelInput
        value={hex}
        label={labels.customColor}
        onPreview={paintPreview}
        onCommit={onPickColor}
        {...{ 'data-whiteout-color-custom': '' }}
      />
    </div>
  );
}
