import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { useFittedColumns } from '../hooks/useFittedColumns.ts';
import type { BatchRow, BatchSummary } from '../state/imageBatch.ts';
import { formatBytes } from '../lib/resultView.ts';
import type { CompressMessages } from '../messages';
import layoutStyles from '#shell/loadedLayout.module.css';
import styles from './BatchGrid.module.css';

interface BatchGridProps {
  t: CompressMessages;
  rows: BatchRow[];
  summary: BatchSummary;
  /** The target the photos were compressed against, which trails the field while a typed one settles. */
  targetKB: number;
  arrow: string;
  /** Each photo's small picture, once drawn. */
  thumbnails: Map<File, string>;
  /** What the pick left out, as quiet lines under the status line. */
  notes: ComponentChildren;
  /** A finished photo, opened in the compare preview. */
  onOpen: (file: File) => void;
  /** The photo whose preview was just closed: its tile takes focus. */
  focusOn?: File | null;
  /** Behind a photo's preview: kept mounted, so its scroll and pictures are as they were on the way back. */
  hidden?: boolean;
}

function rowStatus(t: CompressMessages, row: BatchRow, target: string): string {
  if (row.status === 'waiting') return t.batchRowWaiting;
  if (row.status === 'working') return t.batchRowWorking;
  if (row.status === 'failed') return t.batchRowFailed;
  if (row.passthrough) return formatMessage(t.batchRowKept, { target });
  return formatMessage(row.metTarget ? t.batchRowMet : t.batchRowMissed, { target });
}

/** The line under a photo: its sizes once it has a result, its original size until then. On a narrow tile
 *  the original size gives way first, so the new one always shows whole. */
function Caption({ t, row, arrow }: { t: CompressMessages; row: BatchRow; arrow: string }) {
  if (row.status === 'failed') return <span class={styles.fit}>{t.batchRowFailed}</span>;
  if (row.passthrough) return <span class={styles.fit}>{formatMessage(t.batchTileKept, { size: formatBytes(row.file.size) })}</span>;
  const before = <span class={styles.fit}><bdi>{formatBytes(row.file.size)}</bdi></span>;
  if (!row.blob) return before;
  return <>{before}<span aria-hidden="true">{arrow}</span><b><bdi>{formatBytes(row.blob.size)}</bdi></b></>;
}

/** COMP-04: the set as the photos themselves: where the set stands, then a tile per photo that opens its preview. */
export default function BatchGrid({ t, rows, summary, targetKB, arrow, thumbnails, notes, onOpen, focusOn = null, hidden = false }: BatchGridProps) {
  const target = `${targetKB} KB`;
  const gridRef = useRef<HTMLOListElement>(null);
  const columns = useFittedColumns(gridRef, rows.length);
  // The grid's own scroll, kept across a photo's preview: a hidden box keeps no offset of its own.
  const scrollRef = useRef(0);
  useEffect(() => {
    const grid = gridRef.current;
    if (hidden || !grid) return;
    grid.scrollTop = scrollRef.current;
    const index = focusOn ? rows.findIndex((row) => row.file === focusOn) : -1;
    if (index < 0) return;
    // A tile a new run has not reached yet cannot take focus; the set itself does.
    const tile = grid.children[index]?.querySelector<HTMLButtonElement>('button');
    (tile && !tile.disabled ? tile : grid).focus();
  }, [focusOn, hidden]);
  const heading = !summary.allFinished
    ? formatMessage(t.batchWorking, { done: summary.finished, total: summary.total })
    : formatMessage(summary.met === summary.total ? t.batchAllMet : t.batchSomeMissed, { met: summary.met, total: summary.total, target });
  return (
    <section class={`${styles.batch} ${layoutStyles.stage}`} data-batch hidden={hidden} aria-busy={!summary.allFinished || undefined}>
      <div class={styles.head}>
        <p class={styles.heading} data-batch-summary>{heading}</p>
        {notes}
      </div>
      {/* Only the finished set is announced: a line per photo would talk over the person. */}
      <p class="sr-only" role="status" data-batch-live>{summary.allFinished ? heading : ''}</p>
      {/* role="list": Safari drops the list semantics of an unstyled list. */}
      <ol
        ref={gridRef}
        class={styles.grid}
        role="list"
        tabIndex={-1}
        onScroll={(e) => { scrollRef.current = e.currentTarget.scrollTop; }}
        data-fitted={columns ? '' : undefined} style={columns ? ({ '--columns': columns } as JSX.CSSProperties) : undefined}>
        {rows.map((row) => {
          const outcome = row.status !== 'done' ? row.status : row.passthrough ? 'kept' : row.metTarget ? 'met' : 'missed';
          const thumbnail = thumbnails.get(row.file);
          const captionId = `batch-photo-${row.id}`;
          const body = (
            <>
              <span class={styles.photo} data-batch-thumb>
                {thumbnail && <img src={thumbnail} alt="" decoding="async" draggable={false} />}
                {row.status === 'working' && <span class={styles.ring} aria-hidden="true" />}
              </span>
              <span class={styles.caption} id={captionId} data-batch-caption>
                <Caption t={t} row={row} arrow={arrow} />
                {/* A failed or unchanged photo's caption already says so. */}
                {row.status !== 'failed' && !row.passthrough && <span class="sr-only">, {rowStatus(t, row, target)}</span>}
              </span>
            </>
          );
          return (
            <li key={row.id} class={styles.tile} data-batch-photo data-outcome={outcome} title={row.file.name}>
              {/* One button from the start, enabled once the photo has a result: swapping elements would
                  remount the picture and flash it as each photo finishes. */}
              <button
                type="button"
                class={styles.open}
                disabled={!row.blob}
                onClick={() => onOpen(row.file)}
                aria-label={row.blob ? formatMessage(t.batchRowOpenLabel, { name: row.file.name }) : row.file.name}
                aria-describedby={captionId}
                data-batch-open={row.blob ? '' : undefined}
              >
                {body}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
