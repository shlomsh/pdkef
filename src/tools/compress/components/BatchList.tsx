import FileName from '#shell/FileName.tsx';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { BatchRow, BatchSummary } from '../state/imageBatch.ts';
import { formatBytes } from '../lib/resultView.ts';
import type { CompressMessages } from '../messages';
import layoutStyles from '#shell/loadedLayout.module.css';
import styles from './BatchList.module.css';

interface BatchListProps {
  t: CompressMessages;
  rows: BatchRow[];
  summary: BatchSummary;
  /** The target the rows were compressed against, which trails the field while a typed one settles. */
  targetKB: number;
  arrow: string;
  urlFor: (blob: Blob) => string;
  /** A row's own save, counted like a Download tap. */
  onRowSaved: () => void;
  /** A finished row's photo, opened in the compare preview. */
  onOpen: (file: File) => void;
}

function rowStatus(t: CompressMessages, row: BatchRow, target: string): string {
  if (row.status === 'waiting') return t.batchRowWaiting;
  if (row.status === 'working') return t.batchRowWorking;
  if (row.status === 'failed') return t.batchRowFailed;
  if (row.passthrough) return formatMessage(t.batchRowKept, { target });
  return formatMessage(row.metTarget ? t.batchRowMet : t.batchRowMissed, { target });
}

/** COMP-04: the result area for several photos: where the set stands, then a row per photo. */
export default function BatchList({ t, rows, summary, targetKB, arrow, urlFor, onRowSaved, onOpen }: BatchListProps) {
  const target = `${targetKB} KB`;
  const heading = !summary.allFinished
    ? formatMessage(t.batchWorking, { done: summary.finished, total: summary.total })
    : formatMessage(summary.met === summary.total ? t.batchAllMet : t.batchSomeMissed, { met: summary.met, total: summary.total, target });
  return (
    <section class={`${styles.batch} ${layoutStyles.stage}`} data-batch aria-busy={!summary.allFinished || undefined}>
      <p class={styles.heading} data-batch-summary>{heading}</p>
      {/* Only the finished set is announced: a line per photo would talk over the person. */}
      <p class="sr-only" role="status">{summary.allFinished ? heading : ''}</p>
      {/* role="list": Safari drops the list semantics of an unstyled list. */}
      <ol class={styles.rows} role="list">
        {rows.map((row) => {
          const outcome = row.status !== 'done' ? row.status : row.passthrough ? 'kept' : row.metTarget ? 'met' : 'missed';
          return (
            <li key={row.id} class={styles.row} data-batch-row data-outcome={outcome}>
              {row.blob ? (
                // The whole row opens the preview (the button's ::after covers it); Save sits above it.
                <button type="button" class={`${styles.name} ${styles.open}`} onClick={() => onOpen(row.file)} aria-label={formatMessage(t.batchRowOpenLabel, { name: row.file.name })} data-batch-open>
                  <FileName name={row.file.name} />
                </button>
              ) : (
                <FileName name={row.file.name} className={styles.name} />
              )}
              <span class={styles.sizes}>
                {formatBytes(row.file.size)}
                {row.blob && !row.passthrough && <> {arrow} <strong>{formatBytes(row.blob.size)}</strong></>}
              </span>
              <span class={styles.status}>{rowStatus(t, row, target)}</span>
              {row.blob && row.filename && (
                <a class={styles.save} href={urlFor(row.blob)} download={row.filename} onClick={onRowSaved} aria-label={formatMessage(t.batchRowSaveLabel, { name: row.file.name })} data-batch-save>
                  {t.batchRowSave}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
