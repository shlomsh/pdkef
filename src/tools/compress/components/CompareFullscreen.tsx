import styles from '../PdfCompressTool.module.css';
import type { CompressMessages } from '../messages';
import type { useComparePreviews } from '../hooks/useComparePreviews.ts';
import CompareSlider from './CompareSlider.tsx';

interface CompareFullscreenProps {
  t: CompressMessages;
  compare: ReturnType<typeof useComparePreviews>;
  caption: string;
}

/** The before/after pair at full screen, in a top-layer dialog (COMP-01). */
export default function CompareFullscreen({ t, compare, caption }: CompareFullscreenProps) {
  return (
    <dialog
      ref={compare.fullscreen.dialogRef}
      class={styles['compare-fullscreen']}
      aria-label={t.compareFullscreenLabel}
      onClose={compare.fullscreen.onClosed}
    >
      <div class={styles['compare-fullscreen-header']}>
        <p class={styles['compare-caption']}>{caption}</p>
        <button type="button" class={styles['compare-toggle-button']} onClick={compare.closeFullscreen}>
          {t.compareCloseLabel}
        </button>
      </div>
      <div class={styles['compare-fullscreen-body']}>
        {compare.fullscreen.status === 'loading' && (
          <>
            <div class={styles['compare-skeleton']} aria-hidden="true" />
            <p class={styles['compare-status']} aria-live="polite">{t.compareRendering}</p>
          </>
        )}
        {compare.fullscreen.status === 'error' && <p class={styles['compare-status']}>{t.compareRenderFailed}</p>}
        {compare.fullscreen.previews && (
          <CompareSlider
            fill
            beforeSrc={compare.fullscreen.previews.before}
            afterSrc={compare.fullscreen.previews.after}
            beforeLabel={t.compareBeforeLabel}
            afterLabel={t.compareAfterLabel}
            pageAlt={t.comparePageAlt}
            sliderLabel={t.compareSliderLabel}
          />
        )}
      </div>
    </dialog>
  );
}
