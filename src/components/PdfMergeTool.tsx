import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { mergePdfs, resolvePdfCreationDate } from '../lib/merge.js';
import { sortByDate, sortByName } from '../lib/sort.js';
import { renderThumbnail } from '../lib/thumbnails.js';
import { useObjectUrls } from '../lib/useObjectUrls.js';
import BasePdfTool from './BasePdfTool.tsx';
import styles from './FileList.module.css';
import pdfToolStyles from './PdfTool.module.css';
import sortToolbarStyles from './SortToolbar.module.css';
import PdfShareButton from './PdfShareButton.tsx';
import ProgressRing from './ProgressRing.tsx';
import ErrorMessage from './ErrorMessage.tsx';
import DownloadButton from './DownloadButton.tsx';
import { usePdfShare } from '../lib/usePdfShare.js';
import { formatFileSize } from '../lib/format.js';
import { englishMergeMessages, formatMessage, type MergeMessages, type ShellMessages } from '../i18n/toolMessages';

let nextId = 0;

interface FileEntry {
  id: number;
  file: File;
  pdfCreationDate: any;
  thumbnail: string | null;
}

function toEntry(file: File): FileEntry {
  return { id: nextId++, file, pdfCreationDate: null, thumbnail: null };
}

interface PdfMergeToolProps {
  /** LOC-02: server-rendered by src/pages/[locale]/[tool].astro for a
   * localized edition; every key not overridden keeps the English default,
   * so a partial catalogue degrades to English rather than to `undefined`. */
  messages?: Partial<MergeMessages>;
  shellMessages?: Partial<ShellMessages>;
}

export default function PdfMergeTool({ messages: messagesProp, shellMessages }: PdfMergeToolProps = {}) {
  const t: MergeMessages = { ...englishMergeMessages, ...messagesProp };
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [status, setStatus] = useState('idle'); // idle | merging | done | error
  const [progress, setProgress] = useState(0);
  const { url: downloadUrl, setBlob: setDownloadBlob, clear: clearDownload } = useObjectUrls();
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [addPageNumbers, setAddPageNumbers] = useState(false);
  const { shareReady, prepare, clearPrepared, sharePrepared } = usePdfShare();
  const listRef = useRef<HTMLUListElement | null>(null);
  const sortableRef = useRef<Sortable | null>(null);

  // Drag-to-reorder: SortableJS owns the DOM order during a drag; on drop
  // we read its final order back into Preact state, which becomes the
  // source of truth again for every subsequent render.
  useEffect(() => {
    if (!listRef.current) return undefined;
    sortableRef.current?.destroy();
    sortableRef.current = Sortable.create(listRef.current, {
      animation: 220,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      handle: `.${styles['drag-handle']}`,
      ghostClass: styles['is-ghost'],
      chosenClass: styles['is-chosen'],
      dragClass: styles['is-dragging'],
      forceFallback: false,
      onEnd(evt: Sortable.SortableEvent) {
        if (evt.oldIndex === evt.newIndex || evt.oldIndex == null || evt.newIndex == null) return;
        setEntries((current) => {
          const next = [...current];
          const [moved] = next.splice(evt.oldIndex as number, 1);
          next.splice(evt.newIndex as number, 0, moved);
          return next;
        });
        setStatus('idle');
        clearPrepared();
        clearDownload();
      },
    });
    return () => sortableRef.current?.destroy();
  }, [entries.length > 0]);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const pdfFiles = incoming.filter((f) => f.type === 'application/pdf');
    const rejected = incoming.filter((f) => f.type !== 'application/pdf');

    if (rejected.length > 0) {
      setRejectedFiles(rejected.map((f) => f.name));
    } else {
      setRejectedFiles([]);
    }

    if (pdfFiles.length === 0) return;

    const newEntries = pdfFiles.map(toEntry);
    setEntries((current) => [...current, ...newEntries]);
    setStatus('idle');
    clearPrepared();
    clearDownload();
    setAnnouncement(
      newEntries.length === 1 ? t.filesAddedOne : formatMessage(t.filesAddedMany, { count: newEntries.length }),
    );

    // Thumbnails and PDF metadata are nice-to-have, not blocking - render
    // them as they resolve instead of waiting before the file appears.
    for (const entry of newEntries) {
      renderThumbnail(entry.file)
        .then((thumbnail) => {
          setEntries((current) =>
            current.map((e) => (e.id === entry.id ? { ...e, thumbnail } : e)),
          );
        })
        .catch(() => {});
      resolvePdfCreationDate(entry.file).then((pdfCreationDate) => {
        if (pdfCreationDate == null) return;
        setEntries((current) =>
          current.map((e) => (e.id === entry.id ? { ...e, pdfCreationDate } : e)),
        );
      });
    }
  }, []);

  const removeEntry = useCallback((id: number) => {
    setEntries((current) => {
      const removed = current.find((e) => e.id === id);
      if (removed) setAnnouncement(formatMessage(t.fileRemoved, { name: removed.file.name }));
      return current.filter((e) => e.id !== id);
    });
    setStatus('idle');
    clearPrepared();
    clearDownload();
  }, [t.fileRemoved]);

  const reset = useCallback(() => {
    setEntries([]);
    setStatus('idle');
    clearPrepared();
    setProgress(0);
    setRejectedFiles([]);
    setAddPageNumbers(false);
    clearDownload();
    setAnnouncement(t.cleared);
  }, [t.cleared]);

  const moveEntry = useCallback((id: number, delta: number) => {
    setEntries((current) => {
      const index = current.findIndex((e) => e.id === id);
      const newIndex = index + delta;
      if (index === -1 || newIndex < 0 || newIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(newIndex, 0, moved);
      setAnnouncement(formatMessage(t.fileMovedTo, { name: moved.file.name, position: newIndex + 1, total: next.length }));
      return next;
    });
    setStatus('idle');
    clearPrepared();
    clearDownload();
  }, [t.fileMovedTo]);

  const onItemKeyDown = useCallback(
    (event: KeyboardEvent, id: number) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveEntry(id, -1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveEntry(id, 1);
      }
    },
    [moveEntry],
  );

  const applySort = useCallback((sortFn: (entries: FileEntry[], direction: string) => FileEntry[], direction: string) => {
    setEntries((current) => sortFn(current, direction));
    setStatus('idle');
    clearPrepared();
    clearDownload();
    setAnnouncement(t.filesReordered);
  }, [t.filesReordered]);

  const handleMerge = useCallback(async () => {
    if (entries.length < 2) return;
    setStatus('merging');
    setProgress(0);
    try {
      const blob = await mergePdfs(
        entries.map((e) => e.file),
        { addPageNumbers },
        setProgress,
      );
      setDownloadBlob(blob);
      prepare(blob, 'merged.pdf');
      setStatus('done');
      setAnnouncement(t.mergedReady);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement(t.mergingFailed);
    }
  }, [entries, t.mergedReady, t.mergingFailed]);

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') setAnnouncement(t.sharedSuccessfully);
    else if (result.status === 'canceled') setAnnouncement(t.sharingCanceled);
    else if (result.status === 'error') setAnnouncement(t.shareError);
  };

  const hasFiles = entries.length > 0;
  const fileSummary = entries.length === 1 ? t.fileSummaryOne : formatMessage(t.fileSummaryMany, { count: entries.length });

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      analyticsTool="merge"
      analyticsStatus={status}
      onFilesAdded={addFiles}
      fileLabel={fileSummary}
      fileMeta={formatFileSize(entries.reduce((total, entry) => total + entry.file.size, 0))}
      onClearAll={reset}
      clearSummary={fileSummary}
      shellMessages={shellMessages}
    >

      {rejectedFiles.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {rejectedFiles.length === 1
            ? formatMessage(t.skippedOne, { name: rejectedFiles[0] })
            : formatMessage(t.skippedMany, { count: rejectedFiles.length })}
        </p>
      )}

      {hasFiles && (
        <>
          <div class={sortToolbarStyles.toolbar} role="toolbar" aria-label="Sort files">
            <button type="button" class={sortToolbarStyles.button} onClick={() => applySort(sortByName, 'asc')}>
              {t.sortAZ}
            </button>
            <button type="button" class={sortToolbarStyles.button} onClick={() => applySort(sortByName, 'desc')}>
              {t.sortZA}
            </button>
            <button type="button" class={sortToolbarStyles.button} onClick={() => applySort(sortByDate, 'asc')}>
              {t.sortOldest}
            </button>
            <button type="button" class={sortToolbarStyles.button} onClick={() => applySort(sortByDate, 'desc')}>
              {t.sortNewest}
            </button>
            <label class={pdfToolStyles['page-numbers-toggle']}>
              <input
                type="checkbox"
                checked={addPageNumbers}
                onChange={(e) => {
                  setAddPageNumbers((e.target as HTMLInputElement).checked);
                  setStatus('idle');
                  clearPrepared();
                  clearDownload();
                }}
              />
              <span>{t.addPageNumbers}</span>
            </label>
          </div>

          <p class="sr-only" id="reorder-hint">
            {t.reorderHint}
          </p>

          <ul class={styles['file-list']} ref={listRef} aria-describedby="reorder-hint">
            {entries.map((entry, index) => (
              <li key={entry.id} class={styles['file-item']} data-id={entry.id}>
                <span
                  class={styles['drag-handle']}
                  tabIndex={0}
                  role="button"
                  aria-label={formatMessage(t.dragHandleLabel, { name: entry.file.name, position: index + 1, total: entries.length })}
                  onKeyDown={(e) => onItemKeyDown(e, entry.id)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="5" cy="3" r="1.4" fill="currentColor" />
                    <circle cx="11" cy="3" r="1.4" fill="currentColor" />
                    <circle cx="5" cy="8" r="1.4" fill="currentColor" />
                    <circle cx="11" cy="8" r="1.4" fill="currentColor" />
                    <circle cx="5" cy="13" r="1.4" fill="currentColor" />
                    <circle cx="11" cy="13" r="1.4" fill="currentColor" />
                  </svg>
                </span>

                {entry.thumbnail ? (
                  <img class={`${styles.thumb} ${styles['is-loaded']}`} src={entry.thumbnail} alt="" width="40" />
                ) : (
                  <span class={`${styles.thumb} ${pdfToolStyles['thumb-placeholder']}`} aria-hidden="true" />
                )}

                <span class={styles['file-name']}>{entry.file.name}</span>

                <button
                  type="button"
                  class={styles['remove-button']}
                  aria-label={formatMessage(t.removeLabel, { name: entry.file.name })}
                  onClick={() => removeEntry(entry.id)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            class={`${pdfToolStyles['tool-primary-action']}${status === 'merging' ? ` ${pdfToolStyles['is-processing']}` : ''}${status === 'done' ? ` ${pdfToolStyles['is-done']}` : ''}`}
            disabled={entries.length < 2 || status === 'merging'}
            onClick={handleMerge}
          >
            {status === 'merging' ? (
              <ProgressRing progress={progress} label={t.merging} />
            ) : entries.length === 1 ? (
              t.addOneMore
            ) : (
              formatMessage(t.mergeCount, { count: entries.length })
            )}
          </button>

          {status === 'error' && (
            <ErrorMessage>
              {t.errorMessage}
            </ErrorMessage>
          )}

          {status === 'done' && downloadUrl && (
            <>
              <DownloadButton href={downloadUrl} download="merged.pdf" />
              <PdfShareButton visible={shareReady} onShare={handleShare} />
            </>
          )}
        </>
      )}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
