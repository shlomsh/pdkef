import { Crop } from 'lucide-preact';
import type { Option } from '#shell/pageWorkspace/OptionRow.tsx';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanFilter } from '../lib/filters.ts';
import type { ScanPage } from '../state/scanWork.ts';
import styles from '../PdfScanTool.module.css';
import pageView from './ScanPageView.module.css';
import ResultPage, { type Placement } from './ResultPage.tsx';
import PageActions from './PageActions.tsx';

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
  /** The page was strongly bent or creased (looksBent): a quiet note under it. */
  bent: boolean;
}

/** The one-page view under the head: the page as it will download, then one quiet row of five and one Done. */
export default function ScanResultView({ selected, lookOptions, onChooseLook, onAdjustCorners, onRotate, onRetake, onRetakeCamera, onRemovePage, onDone, pageProps, detail, bent }: ScanResultViewProps) {
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
      {bent && <p class={styles['editor-hint']} data-bent-note>{t.bentNote}</p>}
      <PageActions
        selected={selected}
        lookOptions={lookOptions}
        onChooseLook={onChooseLook}
        onAdjustCorners={onAdjustCorners}
        onRotate={onRotate}
        onRetake={onRetake}
        onRetakeCamera={onRetakeCamera}
        onRemovePage={onRemovePage}
      />
      <button type="button" class={pageView.done} onClick={onDone}>{t.pageDone}</button>
    </>
  );
}
