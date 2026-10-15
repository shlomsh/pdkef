import VerbStage from '../../../shell/verb/VerbStage.tsx';
import styles from './CompressVerb.module.css';
import { mosaicRuns, type Run, type Tone } from './mosaic.ts';

const TONES: Tone[] = ['skyHigh', 'skyLow', 'hill', 'ground', 'sun'];

// Fine, medium, coarse: computed once, drawn as flat-colour squares over the smooth scene.
const LAYERS = [
  { cls: styles.m1, cols: 32, rows: 24, runs: mosaicRuns(32, 24) },
  { cls: styles.m2, cols: 16, rows: 12, runs: mosaicRuns(16, 12) },
  { cls: styles.m3, cols: 8, rows: 6, runs: mosaicRuns(8, 6) },
];

function Photo() {
  return (
    <i class={styles.pb}>
      {LAYERS.map((l) => (
        <svg
          class={`${styles.mos} ${l.cls}`}
          viewBox={`0 0 ${l.cols} ${l.rows}`}
          preserveAspectRatio="none"
          shape-rendering="crispEdges"
        >
          {TONES.map((tone) => (
            <g class={styles[tone]}>
              {l.runs[tone].map((r: Run) => (
                <rect x={r.x} y={r.y} width={r.w} height="1" />
              ))}
            </g>
          ))}
        </svg>
      ))}
    </i>
  );
}

/**
 * Compress's verb: the piece settles a little smaller while its photo loses resolution in
 * three steps, and a loupe over the photo's corner shows the same photo magnified.
 */
export default function CompressVerb({ subject }: { subject: 'page' | 'photo' }) {
  const isPage = subject === 'page';
  return (
    <VerbStage>
      <i class={`${styles.pc} ${isPage ? styles.page : styles.print}`}>
        {isPage && (
          <>
            <i class={styles.hd} />
            <i class={styles.ln} />
          </>
        )}
        <Photo />
        <i class={styles.lp}>
          <i class={styles.hnd} />
          <i class={styles.lz}>
            <Photo />
          </i>
        </i>
      </i>
    </VerbStage>
  );
}
