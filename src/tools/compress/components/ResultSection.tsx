import { Expand } from 'lucide-preact';
import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
import layoutStyles from '#shell/loadedLayout.module.css';
import styles from '../PdfCompressTool.module.css';
import ErrorMessage from '#shell/ErrorMessage.tsx';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import type { CompressMessages } from '../messages';
import type { useComparePreviews } from '../hooks/useComparePreviews.ts';
import type { CompressMeta } from '../lib/compressCallbacks.ts';
import { formatBytes, type ResultView } from '../lib/resultView.ts';
import CompareFullscreen from './CompareFullscreen.tsx';
import CompareSlider, { aspectHandler } from './CompareSlider.tsx';

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

/** The result column: the in-flight placeholder, the failure, the before/after slider, and a passthrough's own note.
 *  Notes about a compressed file sit beside Download instead (ResultNotes). */
export default function ResultSection(props: ResultSectionProps) {
  const { t, compare, file, lastBlob, status, kind, arrow, isDone, showCompare, passthrough, unchanged, rasterBytes,
    dimensions, compressedSize, compareCaption, view } = props;
  const { savingsPercent, resultTitle, resultNotice } = view;
  // The page's width over height, measured from the first image of this file to load: the column sizes the
  // preview to its real shape. Until then the image and its caption stay hidden, so the stage never paints them
  // at a guessed size and then moves them (a layout shift on a slow device).
  const [measured, setMeasured] = useState<{ file: File; aspect: number } | null>(null);
  const aspect = measured?.file === file ? measured.aspect : null;
  const onAspect = (value: number) => setMeasured({ file, aspect: value });

  // The two sides' names and sizes, on the image's top corners: the compressed side on the left, the original
  // on the right. Presses go through them to the slider.
  const pill = (name: string, size: string | null, className?: string) => (
    <span class={className}>
      <bdi>{name}</bdi>
      {size && <><span class={styles['compare-label-sep']}> · </span><bdi>{size}</bdi></>}
    </span>
  );
  const labelRow = (afterName: string, afterSize: string | null) => (
    <p class={styles['compare-labels']} data-compare-labels>
      {pill(afterName, afterSize, styles['compare-label-after'])}
      {pill(t.compareBeforeLabel, formatBytes(file.size))}
    </p>
  );
  // The image as large as the stage allows, with what names it drawn on it, so nothing else takes a row; the
  // caption stays right under it.
  const frame = (image: ComponentChildren, labels: ComponentChildren, action?: ComponentChildren, caption?: ComponentChildren) => (
    <div class={styles['compare-fit']} data-measuring={aspect == null || undefined}>
      <div class={styles['compare-frame']}>
        {image}
        {labels}
        {action}
      </div>
      {caption}
    </div>
  );
  // A photo's size, said once when compressing kept it.
  const dimensionText = kind === 'image' && dimensions && (
    dimensions.width === dimensions.originalWidth && dimensions.height === dimensions.originalHeight
      ? <bdi>{dimensions.width} × {dimensions.height}</bdi>
      : <><bdi>{dimensions.originalWidth} × {dimensions.originalHeight}</bdi> {arrow} <bdi>{dimensions.width} × {dimensions.height}</bdi></>
  );
  const originalBox = compare.original && (
    <div key="original" class={styles['compare-original']}>
      <img src={compare.original} alt={formatMessage(t.comparePageAlt, { label: t.compareBeforeLabel })} draggable={false} onLoad={aspectHandler(onAspect)} />
    </div>
  );

  return (
    <section class={`${styles.result} ${layoutStyles.stage}`} data-result style={aspect ? ({ '--preview-aspect': aspect } as JSX.CSSProperties) : undefined}>
      {status !== 'done' && status !== 'error' && (
        // Keyed apart: reused, the skeleton's own box would move and shrink into the panel's, a
        // layout shift (0.116 at 1440x820, DEBT-56); replaced, the panel is new content.
        compare.original ? (
          <div key="panel" class={styles['compare-panel']} data-compare-panel>
            {frame(originalBox, labelRow(t.compressing, null))}
          </div>
        ) : (
          // Only the page's placeholder: the progress itself is the sheet's
          // button (Download's place), so it is said once, not twice.
          <div key="skeleton" class={styles['compare-fit']}>
            <div class={styles['compare-skeleton']} data-compare-skeleton aria-hidden="true" />
          </div>
        )
      )}

      {status === 'error' && (
        <ErrorMessage title={t.compressionFailedTitle}>
          {kind === 'image' ? t.imageCompressionFailedBody : t.compressionFailedBody}
        </ErrorMessage>
      )}

      {isDone && passthrough && resultTitle && <p class={styles['stats-title']} data-stats-title>{resultTitle}</p>}

      {showCompare && (
        <div class={styles['compare-panel']} data-compare-panel>
          {compare.status === 'loading' && (
            <>
              {/* The visible "still working" placeholder in the slider's own shape; it never holds up Download. */}
              <div class={styles['compare-fit']}>
                <div class={styles['compare-skeleton']} data-compare-skeleton aria-hidden="true" />
              </div>
              <p class={styles['compare-status']} aria-live="polite">{t.compareRendering}</p>
            </>
          )}
          {compare.status === 'error' && <p class={styles['compare-status']}>{t.compareRenderFailed}</p>}
          {compare.previews && (
            <>
              {frame(
                <CompareSlider
                  tags={false}
                  beforeSrc={compare.previews.before}
                  afterSrc={compare.previews.after}
                  beforeLabel={t.compareBeforeLabel}
                  afterLabel={t.compareAfterLabel}
                  pageAlt={t.comparePageAlt}
                  sliderLabel={t.compareSliderLabel}
                  onAspect={onAspect}
                />,
                labelRow(t.compareAfterLabel, formatBytes(compressedSize ?? 0)),
                // Beside the slider, not in it, so a press here never starts a drag.
                <button type="button" class={styles['compare-expand']} onClick={() => { compare.openFullscreen(file, lastBlob).catch((err) => reportError('pdf_render', err, 'compare_open_fullscreen')); }}>
                  <Expand size={16} aria-hidden="true" />
                  {t.compareFullscreenLabel}
                </button>,
                <p class={styles['compare-footer']}>
                  <span>{compareCaption}</span>
                  {dimensionText && <span class={styles['compare-dimensions']}>{dimensionText}</span>}
                </p>,
              )}
            </>
          )}
        </div>
      )}
      {showCompare && compare.fullscreen.open && <CompareFullscreen t={t} compare={compare} caption={compareCaption} />}

      {isDone && passthrough && (
        <StatsGrid t={t} file={file} kind={kind} unchanged={unchanged} rasterBytes={rasterBytes} dimensions={dimensions} savingsPercent={savingsPercent} />
      )}

      {isDone && passthrough && resultNotice && <p class={styles['honest-note']} data-honest-note>{resultNotice}</p>}
      {isDone && passthrough && (originalBox ? frame(originalBox, null) : compare.originalPending && (
        <div class={styles['compare-fit']}>
          <div key="original-skeleton" class={styles['compare-skeleton']} data-compare-skeleton aria-hidden="true" />
        </div>
      ))}
    </section>
  );
}
