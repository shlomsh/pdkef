import styles from '../PdfCompressTool.module.css';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { CompressMessages } from '../messages';
import { formatBytes } from '../lib/resultView.ts';

interface StripSizesProps {
  t: CompressMessages;
  file: File;
  arrow: string;
  /** A compressed result is on screen (done, and not handed back unchanged). */
  showResult: boolean;
  compressedSize: number | null;
  savingsPercent: number;
}

/** The shell strip's meta line: before to after, and the citron tag. Quiet: until a new build lands it keeps
 *  the last result's numbers (or the original alone, before the first result). */
export default function StripSizes({ t, file, arrow, showResult, compressedSize, savingsPercent }: StripSizesProps) {
  const savedLabel = showResult && savingsPercent > 0 ? formatMessage(t.percentSmaller, { percent: savingsPercent }) : null;
  return (
    <span class={styles.sizes} data-compress-sizes>
      <bdi class={styles.before}>{formatBytes(file.size)}</bdi>
      {showResult && compressedSize != null && (
        <>
          <span aria-hidden="true">{arrow}</span>
          <b>
            <bdi>{formatBytes(compressedSize)}</bdi>
          </b>
        </>
      )}
      {savedLabel && <span class={styles.saved}>{savedLabel}</span>}
    </span>
  );
}
