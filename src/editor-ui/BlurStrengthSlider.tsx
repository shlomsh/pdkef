import {
  BLUR_MAX, BLUR_MIN, DEFAULT_BLUR_STRENGTH, resolveBlurStrength, snapBlurStrength,
} from '../editor/model/blurStrength.ts';
import { paintBlurStrength } from '../editor/registry/redactionSurface.ts';
import styles from './BlurStrengthSlider.module.css';

/** Where the default's tick sits along the track, as a percentage. */
export const DEFAULT_TICK_PERCENT = ((DEFAULT_BLUR_STRENGTH - BLUR_MIN) / (BLUR_MAX - BLUR_MIN)) * 100;

/**
 * RED-30: blur strength as a slider in the selected box's toolbar. Gesture
 * golden rule: `input` events only paint the box's blur in the DOM
 * (paintBlurStrength) and never touch state; the browser's `change` event,
 * which fires once on release (pointer up or a key), commits one onChange.
 */
export default function BlurStrengthSlider({
  elementId,
  value,
  onChange,
  labels,
}: {
  elementId: string;
  value?: unknown;
  onChange: (strength: number) => void;
  labels: { title: string; lighter: string; stronger: string; defaultTick: string };
}) {
  const current = resolveBlurStrength(value);
  const read = (input: HTMLInputElement) => snapBlurStrength(Number(input.value));

  return (
    <div className={styles.slider} data-editor-blur-strength-slider>
      <span className={styles.label}>{labels.title}</span>
      <div className={styles.row}>
        <span className={styles.end}>{labels.lighter}</span>
        <div className={styles.track}>
          <span
            className={styles.tick}
            style={{ left: `${DEFAULT_TICK_PERCENT}%` }}
            title={labels.defaultTick}
            aria-hidden="true"
            data-editor-blur-strength-tick
          />
          <input
            type="range"
            className={styles.input}
            min={BLUR_MIN}
            max={BLUR_MAX}
            step={0.01}
            value={current}
            aria-label={labels.title}
            data-editor-blur-strength-input
            onInput={(e) => {
              const input = e.currentTarget;
              const snapped = read(input);
              input.value = String(snapped);
              paintBlurStrength(document, elementId, snapped);
            }}
            onChange={(e) => onChange(read(e.currentTarget))}
          />
        </div>
        <span className={styles.end}>{labels.stronger}</span>
      </div>
    </div>
  );
}
