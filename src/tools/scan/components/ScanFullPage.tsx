import { useEffect } from 'preact/hooks';
import { ChevronLeft, ChevronRight } from 'lucide-preact';
import { englishScanMessages as t } from '../messages.ts';
import styles from '../PdfScanTool.module.css';
import pageView from './ScanPageView.module.css';
import ResultPage, { type Placement } from './ResultPage.tsx';

interface ScanFullPageProps {
  /** The props ResultPage takes for this page, as ScanResultView has them. */
  pageProps: { src: string | null; place: Placement | null; exact: boolean };
  detail: string | undefined;
  atStart: boolean;
  atEnd: boolean;
  /** One page back or on: the same selection the phone's swipe makes. Does nothing at the ends. */
  onStep: (delta: 1 | -1) => void;
}

/** The page at full screen on desktop: only the page and the way through the scan. As in PagePreviewDialog, left is always previous. */
export default function ScanFullPage({ pageProps, detail, atStart, atEnd, onStep }: ScanFullPageProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Alt+Left is the browser's Back, and a key a tile already used is a reorder.
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (event.key === 'ArrowRight') onStep(1);
      else if (event.key === 'ArrowLeft') onStep(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onStep]);
  return (
    <div class={styles['paper-area']}>
      <ResultPage {...pageProps} labels={{ exact: t.resultExact, updating: t.resultUpdating, making: t.processing }} detail={detail} />
      <button type="button" class={`${pageView.step} ${pageView.stepPrevious}`} aria-label={t.previousPage} title={t.previousPage} aria-disabled={atStart} onClick={() => onStep(-1)}>
        <ChevronLeft size={22} aria-hidden="true" />
      </button>
      <button type="button" class={`${pageView.step} ${pageView.stepNext}`} aria-label={t.nextPage} title={t.nextPage} aria-disabled={atEnd} onClick={() => onStep(1)}>
        <ChevronRight size={22} aria-hidden="true" />
      </button>
    </div>
  );
}
