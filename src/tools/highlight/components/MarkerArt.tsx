import { BLANK_BARREL, WHEEL_CAP, markerShades } from '../lib/marker/markerShades.ts';
import styles from './MarkerArt.module.css';

/**
 * A color cell's drawing: a highlighter marker lying at -45deg, the picked ink swiped in behind it as a band.
 * It fills the cell holding it. The wheel wears a rainbow cap over a blank body until a custom color is in force.
 */
export default function MarkerArt({ ink, picked, wheel }: { ink: string; picked: boolean; wheel?: boolean }) {
  const own = markerShades(ink);
  const blank = wheel && !picked;
  const vars: Record<string, string> = {
    '--ink': blank ? BLANK_BARREL : ink,
    '--nib': blank ? BLANK_BARREL : ink,
    '--barrel': blank ? BLANK_BARREL : own.barrel,
    '--cap': wheel ? BLANK_BARREL : own.cap,
    '--clip': wheel ? BLANK_BARREL : own.cap,
  };
  if (wheel) vars['--cap-image'] = WHEEL_CAP;
  return (
    <span class={styles.art} data-marker-art data-picked={picked ? '' : undefined} aria-hidden="true" style={vars}>
      <span class={styles.band} />
      <span class={styles.wrap}>
        <span class={styles.body} />
        <span class={styles.collar} />
        <span class={styles.nib} />
        <span class={wheel ? `${styles.cap} ${styles.wheel}` : styles.cap}><span class={styles.clip} /></span>
      </span>
    </span>
  );
}
