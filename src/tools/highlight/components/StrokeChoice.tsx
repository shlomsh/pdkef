import { sketchBands, sketchUnderline, strokeSeed, svgPath } from '#editor/geometry/sketchStroke.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import { onRadioKeyDown, radioTabIndex } from './radioKeys.ts';
import styles from './StrokeChoice.module.css';

type Stroke = Marker['stroke'];
const SEED = strokeSeed('stroke-choice');

/** One mark drawn in the given stroke inside a w x h box: a band behind text, or a line of `width` along the bottom. Clean is a plain rect, Sketch goes through the shared drawing. */
export function StrokeInk({ underline, sketch, color, opacity = 1, width = 2, w, h, seed = SEED, mark }: {
  underline: boolean; sketch: boolean; color: string; opacity?: number; width?: number; w: number; h: number; seed?: number; mark?: boolean;
}) {
  // A highlight's band leaves room in the box for the sketch's chisel ends and overshoot, which the svg lets spill.
  const band = underline ? { x: 0, y: h - width, w, h: width } : { x: h * 0.25, y: h * 0.15, w: w - h * 0.7, h: h * 0.7 };
  return (
    <svg class={styles.ink} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" data-stroke-mark={mark ? (underline ? 'underline' : 'band') : undefined}>
      {sketch
        ? <path d={svgPath(underline ? sketchUnderline([band], seed, width) : sketchBands([band], seed))} fill={color} fill-opacity={opacity} />
        : <rect x={band.x} y={band.y} width={band.w} height={band.h} fill={color} fill-opacity={opacity} />}
    </svg>
  );
}

/** Clean | Sketch as two scraps of paper, each with its word marked in its stroke; the picked one sits on the mint plate. */
export default function StrokeChoice({ stroke, underline, color, onChange }: { stroke: Stroke; underline: boolean; color: string; onChange(change: Partial<Marker>): void }) {
  const sketch = stroke === 'sketch';
  const scraps: { label: string; sketch: boolean }[] = [{ label: t.strokeClean, sketch: false }, { label: t.strokeSketch, sketch: true }];
  return (
    <span class={styles.group} role="radiogroup" aria-label={t.markStroke} onKeyDown={onRadioKeyDown}>
      {scraps.map((s, i) => {
        const checked = s.sketch === sketch;
        return (
          <button
            key={s.label} type="button" class={styles.scrap} role="radio" aria-label={s.label} aria-checked={checked}
            tabIndex={radioTabIndex(checked, i, true)}
            onClick={() => { if (!checked) onChange({ stroke: s.sketch ? 'sketch' : undefined }); }}
          >
            <span class={styles.paper}>
              <StrokeInk underline={underline} sketch={s.sketch} color={color} opacity={underline ? 1 : 0.5} width={3} w={48} h={18} mark />
              <span class={styles.word}>{s.label}</span>
            </span>
          </button>
        );
      })}
    </span>
  );
}
