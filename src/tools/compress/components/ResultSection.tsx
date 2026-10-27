import styles from '../PdfCompressTool.module.css';
import ErrorMessage from '../../../shell/ErrorMessage.tsx';
import { formatMessage } from '../../../lib/formatMessage';
import { reportError } from '../../../lib/errorReport.ts';
import type { CompressMessages } from '../messages';
import type { useComparePreviews } from '../hooks/useComparePreviews.ts';
import type { CompressMeta } from '../lib/compressCallbacks.ts';
import { formatBytes, type ResultView } from '../lib/resultView.ts';
import CompareFullscreen from './CompareFullscreen.tsx';
import CompareSlider from './CompareSlider.tsx';

type Dimensions = NonNullable<CompressMeta['dimensions']>;

interface StatsGridProps {
  t: CompressMessages;
  file: File;
  kind: 'pdf' | 'image' | null;
  unchanged: boolean;
  rasterBytes: number | null;
  dimensions: Dimensions | null;
  savingsPercent: number;
}

/** The passthrough result's numbers: nothing was re-encoded, so the sizes stand beside each other. */
function StatsGrid({ t, file, kind, unchanged, rasterBytes, dimensions, savingsPercent }: StatsGridProps) {
  return (
    <div class={styles['stats-grid']} data-stats-grid>
      <div class={styles['metric-item']}>
        <span class={styles['metric-label']}>{t.originalSize}</span>
        <span class={styles['metric-val']}>{formatBytes(file.size)}</span>
      </div>
      {rasterBytes != null && (
        <div class={styles['metric-item']}>
          <span class={styles['metric-label']}>{t.asImagesSize}</span>
          <span class={styles['metric-val']}>{formatBytes(rasterBytes)}</span>
        </div>
      )}
      {unchanged && (
        <div class={styles['metric-item']}>
          <span class={styles['metric-label']}>{t.spaceSaved}</span>
          <span class={styles['metric-saving']}>{savingsPercent > 0 ? formatMessage(t.savedPercent, { percent: savingsPercent }) : t.keptOriginal}</span>
        </div>
      )}
      {kind === 'image' && dimensions && (
        <>
          <div class={styles['metric-item']}>
            <span class={styles['metric-label']}>{t.originalDimensions}</span>
            <span class={styles['metric-val']}>{dimensions.originalWidth} × {dimensions.originalHeight}</span>
          </div>
          <div class={styles['metric-item']}>
            <span class={styles['metric-label']}>{t.outputDimensions}</span>
            <span class={styles['metric-val']}>{dimensions.width} × {dimensions.height}</span>
          </div>
        </>
      )}
    </div>
  );
}

interface ResultSectionProps {
  t: CompressMessages;
  compare: ReturnType<typeof useComparePreviews>;
  file: File;
  /** The blob of the result on screen, handed to the full screen render. */
  lastBlob: Blob | null;
  status: 'idle' | 'processing' | 'done' | 'error';
  kind: 'pdf' | 'image' | null;
  arrow: string;
  isDone: boolean;
  showCompare: boolean;
  passthrough: boolean;
  unchanged: boolean;
  rasterBytes: number | null;
  dimensions: Dimensions | null;
  compressedSize: number | null;
  compareCaption: string;
  view: ResultView;
}

/** The result column: the in-flight placeholder, the failure, the before/after slider and every note under it. */
export default function ResultSection(props: ResultSectionProps) {
  const { t, compare, file, lastBlob, status, kind, arrow, isDone, showCompare, passthrough, unchanged, rasterBytes,
    dimensions, compressedSize, compareCaption, view } = props;
  const { savingsPercent, resultTitle, resultNotice, closestWarning, targetMissedNotice } = view;

  // One row above the preview: the compressed side on the left, the original
  // on the right (where the tags sat), each with its size.
  const labelRow = (afterText: string) => (
    <p class={styles['compare-labels']} data-compare-labels>
      <span><bdi>{afterText}</bdi></span>
      <span><bdi>{t.compareBeforeLabel} · {formatBytes(file.size)}</bdi></span>
    </p>
  );
  const originalBox = compare.original && (
    <div key="original" class={styles['compare-original']}>
      <img src={compare.original} alt={formatMessage(t.comparePageAlt, { label: t.compareBeforeLabel })} draggable={false} />
    </div>
  );

  return (
    <section class={styles.result} data-result>
      {status !== 'done' && status !== 'error' && (
        // Keyed apart: reused, the skeleton's own box would move and shrink into the panel's, a
        // layout shift (0.116 at 1440x820, DEBT-56); replaced, the panel is new content.
        compare.original ? (
          <div key="panel" class={styles['compare-panel']} data-compare-panel>
            {labelRow(t.compressing)}
            {originalBox}
          </div>
        ) : (
          // Only the page's placeholder: the progress itself is the sheet's
          // button (Download's place), so it is said once, not twice.
          <div key="skeleton" class={styles['compare-skeleton']} data-compare-skeleton aria-hidden="true" />
        )
      )}

      {status === 'error' && (
        <ErrorMessage title={t.compressionFailedTitle}>
          {kind === 'image' ? t.imageCompressionFailedBody : t.compressionFailedBody}
        </ErrorMessage>
      )}

      {isDone && resultTitle && <p class={styles['stats-title']} data-stats-title>{resultTitle}</p>}

      {showCompare && (
        <div class={styles['compare-panel']} data-compare-panel>
          {compare.status === 'loading' && (
            <>
              {/* The visible "still working" placeholder in the slider's own shape; it never holds up Download. */}
              <div class={styles['compare-skeleton']} data-compare-skeleton aria-hidden="true" />
              <p class={styles['compare-status']} aria-live="polite">{t.compareRendering}</p>
            </>
          )}
          {compare.status === 'error' && <p class={styles['compare-status']}>{t.compareRenderFailed}</p>}
          {compare.previews && (
            <>
              {labelRow(`${t.compareAfterLabel} · ${formatBytes(compressedSize ?? 0)}`)}
              <CompareSlider
                tags={false}
                beforeSrc={compare.previews.before}
                afterSrc={compare.previews.after}
                beforeLabel={t.compareBeforeLabel}
                afterLabel={t.compareAfterLabel}
                pageAlt={t.comparePageAlt}
                sliderLabel={t.compareSliderLabel}
              />
              <p class={styles['compare-caption']}>{compareCaption}</p>
              <button type="button" class={styles['compare-toggle-button']} onClick={() => { compare.openFullscreen(file, lastBlob).catch((err) => reportError('pdf_render', err, 'compare_open_fullscreen')); }}>
                {t.compareFullscreenLabel}
              </button>
            </>
          )}
        </div>
      )}
      {showCompare && compare.fullscreen.open && <CompareFullscreen t={t} compare={compare} caption={compareCaption} />}

      {showCompare && kind === 'image' && dimensions && (
        <p class={styles['dimension-line']}>
          <bdi>{dimensions.originalWidth} × {dimensions.originalHeight}</bdi> {arrow} <bdi>{dimensions.width} × {dimensions.height}</bdi>
        </p>
      )}

      {isDone && passthrough && (
        <StatsGrid t={t} file={file} kind={kind} unchanged={unchanged} rasterBytes={rasterBytes} dimensions={dimensions} savingsPercent={savingsPercent} />
      )}

      {closestWarning && <p class={styles['compress-warning']} data-compress-warning>{closestWarning}</p>}
      {isDone && resultNotice && <p class={styles[passthrough ? 'honest-note' : 'compress-warning']} data-honest-note={passthrough || undefined} data-compress-warning={!passthrough || undefined}>{resultNotice}</p>}
      {isDone && passthrough && (originalBox || (compare.originalPending && <div key="original-skeleton" class={styles['compare-skeleton']} data-compare-skeleton aria-hidden="true" />))}
      {targetMissedNotice && <p class={styles['compress-warning']} data-compress-warning>{targetMissedNotice}</p>}
    </section>
  );
}
