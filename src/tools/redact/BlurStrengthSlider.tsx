import { useRef } from 'preact/hooks';
import {
  BLUR_MAX, BLUR_MIN, DEFAULT_BLUR_STRENGTH, resolveBlurStrength, snapBlurStrength,
} from '../../editor/model/blurStrength.ts';
import { paintBlurStrength } from '../../editor/registry/redactionSurface.ts';
import { useNativeChange } from '../../editor-ui/useNativeChange.ts';
import styles from './BlurStrengthSlider.module.css';

/**
 * RED-30: blur strength as a slider in the selected box's toolbar. Gesture
 * golden rule: `input` events only paint the box's blur in the DOM
 * (paintBlurStrength) and never touch state; the browser's real `change`
 * event, which fires once on release (pointer up or a key), commits one
 * onChange. RED-53: preact/compat turns a JSX `onChange` on a range input into
 * `input`, so the commit listens natively (useNativeChange). Double-click
 * resets to the default.
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
  labels: { title: string; lighter: string; stronger: string };
}) {
  const current = resolveBlurStrength(value);
  const ref = useRef<HTMLInputElement>(null);
  const read = (input: HTMLInputElement) => snapBlurStrength(Number(input.value));
  const paint = (input: HTMLInputElement) => {
    const snapped = read(input);
    input.value = String(snapped);
    paintBlurStrength(document, elementId, snapped);
  };

  useNativeChange(ref, (el) => onChange(read(el)));

  return (
    <div className={styles.slider} data-editor-blur-strength-slider>
      <span className={styles.light} title={labels.lighter} aria-hidden="true" data-editor-blur-strength-light />
      <input
        ref={ref}
        type="range"
        className={styles.input}
        min={BLUR_MIN}
        max={BLUR_MAX}
        step={0.01}
        value={current}
        aria-label={labels.title}
        data-editor-blur-strength-input
        onInput={(e) => paint(e.currentTarget)}
        onDblClick={(e) => {
          const input = e.currentTarget;
          input.value = String(DEFAULT_BLUR_STRENGTH);
          paint(input);
          onChange(read(input));
        }}
      />
      <span className={styles.strong} title={labels.stronger} aria-hidden="true" data-editor-blur-strength-strong />
    </div>
  );
}
