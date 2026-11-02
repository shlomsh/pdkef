import VerbStage from '#shell/verb/VerbStage.tsx';
import { HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';
import styles from './HighlightVerb.module.css';

const ink = (id: (typeof HIGHLIGHT_COLORS)[number]['id']) => HIGHLIGHT_COLORS.find((c) => c.id === id)!.hex;

// Stage coordinates (420 x 236, the VerbStage box); the page sits at 144..276 x 26..198.
const LINES: [y: number, w: number][] = [
  [42, 108], [54, 108], [66, 108], [78, 74],
  [100, 108], [112, 108], [124, 90],
  [146, 108], [158, 108], [170, 60],
];
// Three strokes, each laid along a line in one of the palette's inks; the pink one carries the note.
const MARKS: [y: number, w: number, color: string][] = [
  [54, 108, ink('yellow')],
  [78, 74, ink('pink')],
  [124, 90, ink('blue')],
];

/** Highlight's verb: three marker strokes in three inks sweep along a page, then a note opens beside one. */
export default function HighlightVerb() {
  return (
    <VerbStage>
      <i class={styles.pg} />
      <svg class={styles.art} viewBox="0 0 420 236">
        {LINES.map(([y, w]) => <rect key={y} class={styles.line} x="156" y={y - 1.75} width={w} height="3.5" rx="1.75" />)}
        {MARKS.map(([y, w, color]) => <rect key={y} class={styles.mark} x="154" y={y - 5} width={w + 4} height="10" rx="2" fill={color} />)}
        <path class={styles.cord} pathLength="1" d="M233 78 H292" />
        <g class={styles.note}>
          <rect class={styles.card} x="292" y="62" width="104" height="34" rx="5" />
          <rect x="292" y="62" width="3.5" height="34" rx="1.75" fill={ink('pink')} />
          <rect class={styles.text} x="302" y="72" width="80" height="3.5" rx="1.75" />
          <rect class={styles.text} x="302" y="82" width="54" height="3.5" rx="1.75" />
        </g>
      </svg>
    </VerbStage>
  );
}
