import { Crop } from 'lucide-preact';
import OptionRow, { type Option } from '#shell/pageWorkspace/OptionRow.tsx';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanFilter } from '../lib/filters.ts';
import type { ScanPage } from '../state/scanWork.ts';
import styles from '../PdfScanTool.module.css';
import ResultPage, { type Placement } from './ResultPage.tsx';

interface ScanResultViewProps {
  selected: ScanPage;
  lookOptions: Option<ScanFilter>[];
  onChooseLook: (next: ScanFilter) => void;
  onAdjustCorners: () => void;
  /** The props ResultPage takes for this page: its src, place and whether the built PDF's own JPEG is showing. */
  pageProps: { src: string | null; place: Placement | null; exact: boolean };
  detail: string | undefined;
}

/** The result view under the editor head: the page's look, the not-found note, and the page as it will download. */
export default function ScanResultView({ selected, lookOptions, onChooseLook, onAdjustCorners, pageProps, detail }: ScanResultViewProps) {
  return (
    <>
      {/* The look belongs to this page, so it sits right above it, on the first screen on a phone. */}
      <div class={styles['page-look']}>
        <OptionRow id="scan-look" label={t.lookLabel} options={lookOptions} value={selected.filter} onChange={onChooseLook} dir={t.dir} />
      </div>
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
    </>
  );
}
