import { useState } from 'preact/hooks';
import { Crop, RotateCw, SlidersHorizontal, Trash2 } from 'lucide-preact';
import OptionRow, { type Option } from '#shell/pageWorkspace/OptionRow.tsx';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanFilter } from '../lib/filters.ts';
import type { ScanPage } from '../state/scanWork.ts';
import styles from '../PdfScanTool.module.css';
import pageView from './ScanPageView.module.css';
import ResultPage, { type Placement } from './ResultPage.tsx';
import RetakeButton from './RetakeButton.tsx';

interface ScanResultViewProps {
  selected: ScanPage;
  lookOptions: Option<ScanFilter>[];
  onChooseLook: (next: ScanFilter) => void;
  onAdjustCorners: () => void;
  onRotate: () => void;
  onRetake: (file: File) => void;
  onRetakeCamera?: () => void;
  onRemovePage: (id: number) => void;
  onDone: () => void;
  /** The props ResultPage takes for this page: its src, place and whether the built PDF's own JPEG is showing. */
  pageProps: { src: string | null; place: Placement | null; exact: boolean };
  detail: string | undefined;
}

/** The one-page view under the head: the page as it will download, then one quiet row of five and one Done. */
export default function ScanResultView({ selected, lookOptions, onChooseLook, onAdjustCorners, onRotate, onRetake, onRetakeCamera, onRemovePage, onDone, pageProps, detail }: ScanResultViewProps) {
  const [lookOpen, setLookOpen] = useState(false);
  return (
    <>
      {selected.found === false && !selected.edited && (
        <p class={styles['not-found']} role="status">
          {t.notFound}
          <button type="button" class={workspaceStyles['quiet-button']} onClick={onAdjustCorners}>
            <Crop size={16} aria-hidden="true" />
            {t.adjustCorners}
          </button>
        </p>
      )}
      <div class={styles['paper-area']}>
        <ResultPage {...pageProps} labels={{ exact: t.resultExact, updating: t.resultUpdating, making: t.processing }} detail={detail} />
      </div>
      {lookOpen && (
        <div class={pageView.look}>
          <OptionRow id="scan-look" label={t.lookLabel} options={lookOptions} value={selected.filter} onChange={onChooseLook} dir={t.dir} />
        </div>
      )}
      <div class={pageView.actions} data-page-actions>
        <button type="button" class={pageView.item} onClick={onAdjustCorners}>
          <Crop size={20} aria-hidden="true" />
          <span>{t.cornersAction}</span>
        </button>
        <button type="button" class={pageView.item} onClick={onRotate}>
          <RotateCw size={20} aria-hidden="true" />
          <span>{t.rotate}</span>
        </button>
        <button type="button" class={pageView.item} aria-expanded={lookOpen} onClick={() => setLookOpen(!lookOpen)}>
          <SlidersHorizontal size={20} aria-hidden="true" />
          <span>{t.lookAction}</span>
        </button>
        <RetakeButton onRetake={onRetake} onCamera={onRetakeCamera} />
        <button type="button" class={`${pageView.item} ${pageView.danger}`} onClick={() => onRemovePage(selected.id)}>
          <Trash2 size={20} aria-hidden="true" />
          <span>{t.removeShort}</span>
        </button>
      </div>
      <button type="button" class={pageView.done} onClick={onDone}>{t.pageDone}</button>
    </>
  );
}
