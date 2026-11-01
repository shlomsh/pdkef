import { OPACITY_MIN } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import styles from './OpacitySlider.module.css';

/** R19: a highlight's opacity, from the floor to 100%, wherever the colors are chosen (the marker and a mark). */
export default function OpacitySlider({ value, onChange }: { value: number; onChange(opacity: number): void }) {
  return (
    <div class={styles.slider} data-opacity-slider>
      <span class={styles.faint} aria-hidden="true" data-opacity-faint />
      <input
        type="range" class={styles.input} min={OPACITY_MIN} max={1} step={0.05} value={value} aria-label={t.markOpacity}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
      />
      <span class={styles.solid} aria-hidden="true" data-opacity-solid />
    </div>
  );
}
