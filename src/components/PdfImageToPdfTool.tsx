import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { imagesToPdf } from '../lib/imageToPdf.js';
import { sortByDate, sortByName } from '../lib/sort.js';
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

let nextId = 0;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];

interface ImageEntry {
  id: number;
  file: File;
  thumbnail: string;
}

function toEntry(file: File): ImageEntry {
  return { id: nextId++, file, thumbnail: URL.createObjectURL(file) };
}

export default function PdfImageToPdfTool() {
  const [entries, setEntries] = useState<ImageEntry[]>([]);
  const [status, setStatus] = useState('idle'); // idle | converting | done | error
  const [progress, setProgress] = useState(0);
  const { url: downloadUrl, setBlob: setDownloadBlob, clear: clearDownload } = useObjectUrls();
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const { shareReady, prepare, clearPrepared, sharePrepared } = usePdfShare();
  const listRef = useRef<HTMLUListElement | null>(null);
  const sortableRef = useRef<Sortable | null>(null);

  useEffect(() => {
    clearPrepared();
  }, [entries, clearPrepared]);

  useEffect(() => {
    // Revoke every thumbnail object URL on unmount.
    return () => {
      for (const entry of entries) URL.revokeObjectURL(entry.thumbnail);
    };
  }, []);

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
        clearDownload();
      },
    });
    return () => sortableRef.current?.destroy();
  }, [entries.length > 0]);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const imageFiles = incoming.filter((f) => ACCEPTED_TYPES.includes(f.type));
    const rejected = incoming.filter((f) => !ACCEPTED_TYPES.includes(f.type));

    setRejectedFiles(rejected.length > 0 ? rejected.map((f) => f.name) : []);

    if (imageFiles.length === 0) return;

    const newEntries = imageFiles.map(toEntry);
    setEntries((current) => [...current, ...newEntries]);
    setStatus('idle');
    clearDownload();
    setAnnouncement(
      `${newEntries.length} image${newEntries.length === 1 ? '' : 's'} added.`,
    );
  }, []);

  const removeEntry = useCallback((id: number) => {
    setEntries((current) => {
      const removed = current.find((e) => e.id === id);
      if (removed) {
        setAnnouncement(`${removed.file.name} removed.`);
        URL.revokeObjectURL(removed.thumbnail);
      }
      return current.filter((e) => e.id !== id);
    });
    setStatus('idle');
    clearDownload();
  }, []);

  const reset = useCallback(() => {
    setEntries((current) => {
      for (const entry of current) URL.revokeObjectURL(entry.thumbnail);
      return [];
    });
    setStatus('idle');
    setProgress(0);
    setRejectedFiles([]);
    clearDownload();
    setAnnouncement('Cleared. Add images to start again.');
  }, []);

  const moveEntry = useCallback((id: number, delta: number) => {
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
    clearDownload();
  }, []);

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

  const applySort = useCallback((sortFn: (entries: ImageEntry[], direction: string) => ImageEntry[], direction: string) => {
    setEntries((current) => sortFn(current, direction));
    setStatus('idle');
    clearDownload();
    setAnnouncement('Images reordered.');
  }, []);

  const handleConvert = useCallback(async () => {
    if (entries.length === 0) return;
    setStatus('converting');
    setProgress(0);
    try {
      const blob = await imagesToPdf(
        entries.map((e) => e.file),
        setProgress,
      );
      setDownloadBlob(blob);
      prepare(blob, 'images.pdf');
      setStatus('done');
      setAnnouncement('Your PDF is ready.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('Conversion failed.');
    }
  }, [entries]);

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') setAnnouncement('PDF shared successfully.');
    else if (result.status === 'canceled') setAnnouncement('Sharing canceled. Your PDF is still ready.');
    else if (result.status === 'error') setAnnouncement('Could not open the share sheet. Please try again.');
  };

  const hasFiles = entries.length > 0;
  const fileSummary = `${entries.length} image${entries.length === 1 ? '' : 's'}`;

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      onFilesAdded={addFiles}
      accept="image/jpeg,image/png"
      emptyStateMessage="Drop images here"
      fileLabel={fileSummary}
      fileMeta={formatFileSize(entries.reduce((total, entry) => total + entry.file.size, 0))}
      onClearAll={reset}
      clearSummary={fileSummary}
    >
      {rejectedFiles.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {rejectedFiles.length === 1
            ? `Skipped “${rejectedFiles[0]}” - not a JPG or PNG.`
            : `Skipped ${rejectedFiles.length} files - not JPG or PNG.`}
        </p>
      )}

      {hasFiles && (
        <>
          <div class={sortToolbarStyles.toolbar} role="toolbar" aria-label="Sort images">
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
          </div>

          <p class="sr-only" id="reorder-hint">
            Drag an image by its handle to reorder, or focus an image and press
            the arrow up or down keys to move it.
          </p>

          <ul class={styles['file-list']} ref={listRef} aria-describedby="reorder-hint">
            {entries.map((entry, index) => (
              <li key={entry.id} class={styles['file-item']} data-id={entry.id}>
                <span
                  class={styles['drag-handle']}
                  tabIndex={0}
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

                <img class={`${styles.thumb} ${styles['is-loaded']}`} src={entry.thumbnail} alt="" width="40" />

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
            class={`${pdfToolStyles['tool-primary-action']}${status === 'converting' ? ` ${pdfToolStyles['is-processing']}` : ''}${status === 'done' ? ` ${pdfToolStyles['is-done']}` : ''}`}
            disabled={entries.length === 0 || status === 'converting'}
            onClick={handleConvert}
          >
            {status === 'converting' ? (
              <ProgressRing progress={progress} label="Converting…" />
            ) : (
              `Convert ${entries.length} image${entries.length === 1 ? '' : 's'} to PDF`
            )}
          </button>

          {status === 'error' && (
            <ErrorMessage>
              A file may be damaged - remove it and try again.
            </ErrorMessage>
          )}

          {status === 'done' && downloadUrl && (
            <>
              <DownloadButton href={downloadUrl} download="images.pdf" />
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
