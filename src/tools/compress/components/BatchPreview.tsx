import { useEffect, useRef } from 'preact/hooks';
import FileName from '#shell/FileName.tsx';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import type { useComparePreviews } from '../hooks/useComparePreviews.ts';
import { deriveResultView } from '../lib/resultView.ts';
import type { CompressMessages } from '../messages';
import type { BatchRow } from '../state/imageBatch.ts';
import styles from './BatchPreview.module.css';
import ResultSection from './ResultSection.tsx';

interface BatchPreviewProps {
  t: CompressMessages;
  compare: ReturnType<typeof useComparePreviews>;
  row: BatchRow;
  /** The whole set, in order: the bar steps through its finished photos. */
  rows: BatchRow[];
  /** The target the row was compressed against. */
  targetKB: number;
  arrow: string;
  urlFor: (blob: Blob) => string;
  /** This photo's own save, counted like a Download tap. */
  onSaved: () => void;
  onOpen: (file: File) => void;
  onBack: () => void;
}

const LEFT = 'M10 3.5 5.5 8l4.5 4.5';
const RIGHT = 'M6 3.5 10.5 8 6 12.5';

function Glyph({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/** COMP-04: one photo of a set in the single photo's own result column, compare and Full screen included,
 *  under a bar that goes back to the set, steps to the photo beside it, and saves this one. */
export default function BatchPreview({ t, compare, row, rows, targetKB, arrow, urlFor, onSaved, onOpen, onBack }: BatchPreviewProps) {
  const { file, blob, passthrough, dimensions, filename } = row;
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

  // On a phone the set may have scrolled the page well past the preview's top: show the bar it opens under.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => { barRef.current?.scrollIntoView?.({ block: 'nearest' }); }, []);

  // Escape goes back to the set, as the bar's own button does, except while Full screen is open (Escape
  // closes that alone) or while a field takes the key.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A held key's repeat would leave the preview right after Full screen closed on the first press.
      if (event.key !== 'Escape' || event.repeat || event.defaultPrevented || document.querySelector('dialog[open]')) return;
      if ((event.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      onBackRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const index = rows.indexOf(row);
  const previous = rows.slice(0, index).reverse().find((r) => r.blob);
  const next = rows.slice(index + 1).find((r) => r.blob);
  // "Back" and "previous" point the way the page reads.
  const [back, forward] = t.dir === 'rtl' ? [RIGHT, LEFT] : [LEFT, RIGHT];

  const status = row.status === 'done' ? 'done' : row.status === 'failed' ? 'error' : 'processing';
  const isDone = status === 'done';
  const view = deriveResultView({
    t, file, kind: 'image', level: 'target', targetKB, flatten: false, isDone, compressedSize: blob?.size ?? null, passthrough,
    unchanged: false, metTarget: row.metTarget ?? true, rasterBytes: null, imageReason: null, keptBytes: 0, resultImageBytes: 0,
  });
  const bar = (
    <div ref={barRef} class={styles.bar} data-batch-preview-bar>
      <button type="button" class={`${styles.pill} ${styles.back}`} onClick={onBack} data-batch-back>
        <Glyph d={back} />
        {formatMessage(t.batchBack, { count: rows.length })}
      </button>
      <FileName name={file.name} className={styles.name} />
      <div class={styles.step}>
        {/* aria-disabled, not disabled: a keyboard press on the last arrow keeps its focus. */}
        <button type="button" class={styles.arrow} aria-disabled={!previous || undefined} onClick={() => previous && onOpen(previous.file)} aria-label={t.batchPrevious} data-batch-prev>
          <Glyph d={back} />
        </button>
        <span class={styles.position} data-batch-position>{formatMessage(t.batchPosition, { index: index + 1, total: rows.length })}</span>
        <button type="button" class={styles.arrow} aria-disabled={!next || undefined} onClick={() => next && onOpen(next.file)} aria-label={t.batchNext} data-batch-next>
          <Glyph d={forward} />
        </button>
      </div>
      {blob && filename && (
        <a class={`${styles.pill} ${styles.save}`} href={urlFor(blob)} download={filename} onClick={onSaved} aria-label={formatMessage(t.batchRowSaveLabel, { name: file.name })} data-batch-save>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 2.5v8m0 0L4.5 7M8 10.5 11.5 7M3 13.5h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {t.batchRowSave}
        </a>
      )}
    </div>
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
      header={bar}
    />
  );
}
