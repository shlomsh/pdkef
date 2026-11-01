import { useId } from 'preact/hooks';
import { OPACITY_MIN } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import styles from './OpacitySlider.module.css';

/** R19: a highlight's opacity, from the floor to 100%, wherever the colors are chosen (the marker and a mark). */
export default function OpacitySlider({ value, onChange }: { value: number; onChange(opacity: number): void }) {
  const id = useId();
  const fill = `${Math.round(((value - OPACITY_MIN) / (1 - OPACITY_MIN)) * 100)}%`;
  return (
    <div class={styles.row} data-opacity-slider>
      <label for={id}>{t.markOpacity}</label>
      <input
        id={id} type="range" class={styles.range} min={OPACITY_MIN} max={1} step={0.05} value={value} style={{ '--fill': fill }}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
      />
      <span class={styles.value} data-opacity-value aria-hidden="true">{Math.round(value * 100)}%</span>
    </div>
  );
}
