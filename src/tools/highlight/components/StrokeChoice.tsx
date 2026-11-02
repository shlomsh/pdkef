import { sketchBands, sketchUnderline, strokeSeed, svgPath } from '#editor/geometry/sketchStroke.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import { onRadioKeyDown, radioTabIndex } from './radioKeys.ts';
import styles from './StrokeChoice.module.css';

type Box = { x: number; y: number; w: number; h: number };
const SEED = strokeSeed('stroke-choice');
// The mark's own hatch climbs 49 degrees on screen (hatchStroke.ts); the preview leans the same way.
const HATCH_SLOPE = Math.tan((49 * Math.PI) / 180);

/** Parallel lines `gap` apart that climb to the right, clipped to the box, as [x1, y1, x2, y2] from the low end up. A static stand-in for the
 * pencil's rough.js hatch, which loads lazily and is too heavy for a 48 px preview. @testSeam */
export function hatchLines({ x, y, w, h }: Box, gap: number): [number, number, number, number][] {
  const step = gap * Math.hypot(HATCH_SLOPE, 1);
  const first = x * HATCH_SLOPE + y;
  const last = (x + w) * HATCH_SLOPE + y + h;
  const lines: [number, number, number, number][] = [];
  for (let c = first + step / 2; c < last; c += step) {
    const xa = Math.max(x, (c - y - h) / HATCH_SLOPE);
    const xb = Math.min(x + w, (c - y) / HATCH_SLOPE);
    if (xb - xa > 0.5) lines.push([xa, c - xa * HATCH_SLOPE, xb, c - xb * HATCH_SLOPE]);
  }
  return lines;
}

/** One mark drawn in the given look inside a w x h box: a band behind text, a line of `width` along the bottom, or hatching over the band.
 * Clean is a plain rect, Sketch goes through the shared drawing, Pencil is `hatchLines`. */
export function StrokeInk({ underline, sketch, pencil = false, color, opacity = 1, width = 2, w, h, seed = SEED, mark }: {
  underline: boolean; sketch: boolean; pencil?: boolean; color: string; opacity?: number; width?: number; w: number; h: number; seed?: number; mark?: boolean;
}) {
  // A highlight's band leaves room in the box for the sketch's chisel ends and overshoot, which the svg lets spill.
  const band = underline ? { x: 0, y: h - width, w, h: width } : { x: h * 0.25, y: h * 0.15, w: w - h * 0.7, h: h * 0.7 };
  const hatch = pencil && !underline;
  return (
    <svg class={styles.ink} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" data-stroke-mark={mark ? (underline ? 'underline' : hatch ? 'hatch' : 'band') : undefined}>
      {hatch
        ? <path
            d={hatchLines(band, h / 5).map(([x1, y1, x2, y2]) => `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`).join('')}
            fill="none" stroke={color} stroke-opacity={opacity} stroke-width={1.4} stroke-linecap="round" vector-effect="non-scaling-stroke"
          />
        : sketch
          ? <path d={svgPath(underline ? sketchUnderline([band], seed, width) : sketchBands([band], seed))} fill={color} fill-opacity={opacity} />
          : <rect x={band.x} y={band.y} width={band.w} height={band.h} fill={color} fill-opacity={opacity} />}
    </svg>
  );
}

type Look = Pick<Marker, 'style' | 'stroke' | 'color'>;
type Choice = { label: string; sketch: boolean; pencil: boolean; change: Partial<Marker>; keys?: string };

/** The ways a mark can be drawn: Clean | Sketch | Pencil for a highlight, Clean | Sketch for an underline (it has no pencil). A highlight's
 * choice carries its style too, so leaving Pencil for Clean makes it a plain highlight again. */
function choices(underline: boolean): Choice[] {
  if (underline) {
    return [
      { label: t.strokeClean, sketch: false, pencil: false, change: { stroke: undefined } },
      { label: t.strokeSketch, sketch: true, pencil: false, change: { stroke: 'sketch' } },
    ];
  }
  return [
    { label: t.strokeClean, sketch: false, pencil: false, change: { style: 'highlight', stroke: undefined } },
    { label: t.strokeSketch, sketch: true, pencil: false, change: { style: 'highlight', stroke: 'sketch' } },
    { label: t.markPencil, sketch: false, pencil: true, change: { style: 'pencil' }, keys: 'P' },
  ];
}

/** One segmented toggle: a quiet track of equal segments, each word marked in its own look, and a paper thumb that slides under the picked one. */
export default function StrokeChoice({ look, onChange }: { look: Look; onChange(change: Partial<Marker>): void }) {
  const underline = look.style === 'underline';
  const options = choices(underline);
  const picked = look.style === 'pencil' ? 2 : look.stroke === 'sketch' ? 1 : 0;
  return (
    <span
      class={styles.group} role="radiogroup" aria-label={t.markStroke} onKeyDown={onRadioKeyDown}
      style={{ '--picked': String(picked), '--count': String(options.length) }}
    >
      <span class={styles.thumb} aria-hidden="true" />
      {options.map((o, i) => {
        const checked = i === picked;
        return (
          <button
            key={o.label} type="button" class={styles.option} role="radio" aria-label={o.label} aria-checked={checked}
            aria-keyshortcuts={o.keys} tabIndex={radioTabIndex(checked, i, true)}
            onClick={() => { if (!checked) onChange(o.change); }}
          >
            <span class={styles.word}>
              <StrokeInk
                underline={underline} sketch={o.sketch} pencil={o.pencil} color={look.color} opacity={underline || o.pencil ? 0.9 : 0.5}
                width={2.5} w={48} h={18} mark
              />
              <span class={styles.text}>{o.label}</span>
            </span>
          </button>
        );
      })}
    </span>
  );
}
