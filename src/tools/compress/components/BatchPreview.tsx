import { useEffect } from 'preact/hooks';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import type { useComparePreviews } from '../hooks/useComparePreviews.ts';
import { deriveResultView } from '../lib/resultView.ts';
import type { CompressMessages } from '../messages';
import type { BatchRow } from '../state/imageBatch.ts';
import styles from './BatchList.module.css';
import ResultSection from './ResultSection.tsx';

interface BatchPreviewProps {
  t: CompressMessages;
  compare: ReturnType<typeof useComparePreviews>;
  row: BatchRow;
  /** The target the row was compressed against. */
  targetKB: number;
  total: number;
  arrow: string;
  onBack: () => void;
}

/** COMP-04: one photo of a set in the single photo's own result column, compare and Full screen included. */
export default function BatchPreview({ t, compare, row, targetKB, total, arrow, onBack }: BatchPreviewProps) {
  const { file, blob, passthrough, dimensions } = row;
  // The preview follows its row: a photo brings its original, each new result its pair.
  useEffect(() => {
    compare.loadOriginal(file);
    return () => {
      compare.clear();
      compare.clearOriginal();
    };
  }, [file]);
  useEffect(() => {
    compare.clear();
    if (blob && !passthrough) compare.open(file, blob).catch((err) => reportError('pdf_render', err, 'compare_open'));
  }, [blob]);

  const status = row.status === 'done' ? 'done' : row.status === 'failed' ? 'error' : 'processing';
  const isDone = status === 'done';
  const view = deriveResultView({
    t, file, kind: 'image', level: 'target', targetKB, flatten: false, isDone, compressedSize: blob?.size ?? null, passthrough,
    unchanged: false, metTarget: row.metTarget ?? true, rasterBytes: null, imageReason: null, keptBytes: 0, resultImageBytes: 0,
  });
  const back = (
    <button type="button" class={styles.back} onClick={onBack} data-batch-back>
      <span aria-hidden="true">{t.dir === 'rtl' ? '→' : '←'}</span> {formatMessage(t.batchBack, { count: total })}
    </button>
  );
  return (
    <ResultSection
      t={t}
      compare={compare}
      file={file}
      lastBlob={blob}
      status={status}
      kind="image"
      arrow={arrow}
      isDone={isDone}
      showCompare={isDone && !passthrough}
      passthrough={passthrough}
      unchanged={false}
      rasterBytes={null}
      dimensions={dimensions}
      compressedSize={blob?.size ?? null}
      compareCaption={t.compareCaptionImage}
      view={view}
      header={back}
    />
  );
}
