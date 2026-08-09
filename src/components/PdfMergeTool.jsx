import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { mergePdfs, resolvePdfCreationDate } from '../lib/merge.js';
import { sortByDate, sortByName } from '../lib/sort.js';
import { renderThumbnail } from '../lib/thumbnails.js';
import { useObjectUrls } from '../lib/useObjectUrls.js';
import BasePdfTool from './BasePdfTool.jsx';
import styles from './FileList.module.css';
import pdfToolStyles from './PdfTool.module.css';
import sortToolbarStyles from './SortToolbar.module.css';
import PdfShareButton from './PdfShareButton.jsx';
import ProgressRing from './ProgressRing.jsx';
import ErrorMessage from './ErrorMessage.jsx';
import DownloadButton from './DownloadButton.jsx';
import { usePdfShare } from '../lib/usePdfShare.js';
import { formatFileSize } from '../lib/format.js';

let nextId = 0;

function toEntry(file) {
  return { id: nextId++, file, pdfCreationDate: null, thumbnail: null };
}

export default function PdfMergeTool() {
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | merging | done | error
  const [progress, setProgress] = useState(0);
  const { url: downloadUrl, setBlob: setDownloadBlob, clear: clearDownload } = useObjectUrls();
  const [rejectedFiles, setRejectedFiles] = useState([]);
  const [announcement, setAnnouncement] = useState('');
  const [addPageNumbers, setAddPageNumbers] = useState(false);
  const { shareReady, prepare, clearPrepared, sharePrepared } = usePdfShare();
  const listRef = useRef(null);
  const sortableRef = useRef(null);

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
      onEnd(evt) {
        if (evt.oldIndex === evt.newIndex) return;
        setEntries((current) => {
          const next = [...current];
          const [moved] = next.splice(evt.oldIndex, 1);
          next.splice(evt.newIndex, 0, moved);
          return next;
        });
        setStatus('idle');
        clearPrepared();
        clearDownload();
      },
    });
    return () => sortableRef.current?.destroy();
  }, [entries.length > 0]);

  const addFiles = useCallback((fileList) => {
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
      `${newEntries.length} file${newEntries.length === 1 ? '' : 's'} added.`,
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

  const removeEntry = useCallback((id) => {
    setEntries((current) => {
      const removed = current.find((e) => e.id === id);
      if (removed) setAnnouncement(`${removed.file.name} removed.`);
      return current.filter((e) => e.id !== id);
    });
    setStatus('idle');
    clearPrepared();
    clearDownload();
  }, []);

  const reset = useCallback(() => {
    setEntries([]);
    setStatus('idle');
    clearPrepared();
    setProgress(0);
    setRejectedFiles([]);
    setAddPageNumbers(false);
    clearDownload();
    setAnnouncement('Cleared. Add PDFs to start again.');
  }, []);

  const moveEntry = useCallback((id, delta) => {
    setEntries((current) => {
      const index = current.findIndex((e) => e.id === id);
      const newIndex = index + delta;
      if (index === -1 || newIndex < 0 || newIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(newIndex, 0, moved);
      setAnnouncement(`${moved.file.name} moved to position ${newIndex + 1} of ${next.length}.`);
      return next;
    });
    setStatus('idle');
    clearPrepared();
    clearDownload();
  }, []);

  const onItemKeyDown = useCallback(
    (event, id) => {
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

  const applySort = useCallback((sortFn, direction) => {
    setEntries((current) => sortFn(current, direction));
    setStatus('idle');
    clearPrepared();
    clearDownload();
    setAnnouncement('Files reordered.');
  }, []);

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
      setAnnouncement('Your merged PDF is ready.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('Merging failed.');
    }
  }, [entries]);

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') setAnnouncement('Merged PDF shared successfully.');
    else if (result.status === 'canceled') setAnnouncement('Sharing canceled. Your merged PDF is still ready.');
    else if (result.status === 'error') setAnnouncement('Could not open the share sheet. Please try again.');
  };

  const hasFiles = entries.length > 0;
  const fileSummary = `${entries.length} PDF${entries.length === 1 ? '' : 's'}`;

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      onFilesAdded={addFiles}
      fileLabel={fileSummary}
      fileMeta={formatFileSize(entries.reduce((total, entry) => total + entry.file.size, 0))}
      onClearAll={reset}
      clearSummary={fileSummary}
    >

      {rejectedFiles.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {rejectedFiles.length === 1
            ? `Skipped “${rejectedFiles[0]}” - not a PDF.`
            : `Skipped ${rejectedFiles.length} files - not PDFs.`}
        </p>
      )}

      {hasFiles && (
        <>
          <div class={sortToolbarStyles.toolbar} role="toolbar" aria-label="Sort files">
            <button type="button" class={sortToolbarStyles.button} onClick={() => applySort(sortByName, 'asc')}>
              A–Z
            </button>
            <button type="button" class={sortToolbarStyles.button} onClick={() => applySort(sortByName, 'desc')}>
              Z–A
            </button>
            <button type="button" class={sortToolbarStyles.button} onClick={() => applySort(sortByDate, 'asc')}>
              Oldest
            </button>
            <button type="button" class={sortToolbarStyles.button} onClick={() => applySort(sortByDate, 'desc')}>
              Newest
            </button>
            <label class={pdfToolStyles['page-numbers-toggle']}>
              <input
                type="checkbox"
                checked={addPageNumbers}
                onChange={(e) => {
                  setAddPageNumbers(e.target.checked);
                  setStatus('idle');
                  clearPrepared();
                  clearDownload();
                }}
              />
              <span>Add page numbers</span>
            </label>
          </div>

          <p class="sr-only" id="reorder-hint">
            Drag a file by its handle to reorder, or focus a file and press the
            arrow up or down keys to move it.
          </p>

          <ul class={styles['file-list']} ref={listRef} aria-describedby="reorder-hint">
            {entries.map((entry, index) => (
              <li key={entry.id} class={styles['file-item']} data-id={entry.id}>
                <span
                  class={styles['drag-handle']}
                  tabIndex="0"
                  role="button"
                  aria-label={`${entry.file.name}, position ${index + 1} of ${entries.length}. Drag, or press arrow up or down to move.`}
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
                  aria-label={`Remove ${entry.file.name}`}
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
            class={`${pdfToolStyles['merge-button']}${status === 'merging' ? ` ${pdfToolStyles['is-merging']}` : ''}${status === 'done' ? ` ${pdfToolStyles['is-done']}` : ''}`}
            disabled={entries.length < 2 || status === 'merging'}
            onClick={handleMerge}
          >
            {status === 'merging' ? (
              <ProgressRing progress={progress} label="Merging…" />
            ) : entries.length === 1 ? (
              'Add 1 more to merge'
            ) : (
              `Merge ${entries.length} PDFs`
            )}
          </button>

          {status === 'error' && (
            <ErrorMessage>
              A file may be damaged or password-protected - remove it and try again.
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
