import OptionRow from '#shell/pageWorkspace/OptionRow.tsx';
import { limitOptions } from '../lib/scanOptions.ts';
import type { SizeLimitId } from '../lib/scanBudget.ts';
import { englishScanMessages as t } from '../messages.ts';
import styles from './ScanPhoneTable.module.css';

interface ScanSizeRowProps {
  /** The built PDF's size, formatted; null while it builds. */
  sizeText: string | null;
  limit: SizeLimitId;
  onLimit: (next: SizeLimitId) => void;
  limitNote: string | undefined;
}

/** The table's Size block: the real size of the PDF as the large value, the limits inline under it. */
export default function ScanSizeRow({ sizeText, limit, onLimit, limitNote }: ScanSizeRowProps) {
  return (
    <div class={styles.size}>
      <p class={styles['size-line']}>
        <span class={styles['size-label']}>{t.sizeLabel}</span>
        {/* Reserved width and tabular figures: the value changing never moves what is beside it. */}
        <span class={styles['size-value']} data-size-value data-pending={sizeText === null || undefined} aria-live="polite">{sizeText ?? t.resultUpdating}</span>
      </p>
      <OptionRow id="scan-limit-table" label={t.limitLabel} showLabel={false} options={limitOptions()} value={limit} onChange={onLimit} dir={t.dir} note={limitNote} />
    </div>
  );
}
