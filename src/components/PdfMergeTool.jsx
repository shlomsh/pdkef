import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { mergePdfs, resolvePdfCreationDate } from '../lib/merge.js';
import { sortByDate, sortByName } from '../lib/sort.js';
import { renderThumbnail } from '../lib/thumbnails.js';

let nextId = 0;

function toEntry(file) {
  return { id: nextId++, file, pdfCreationDate: null, thumbnail: null };
}

const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * 18;

export default function PdfMergeTool() {
  const [entries, setEntries] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | merging | done | error
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [rejectedFiles, setRejectedFiles] = useState([]);
  const [announcement, setAnnouncement] = useState('');
  const listRef = useRef(null);
  const sortableRef = useRef(null);

  // Drag-to-reorder: SortableJS owns the DOM order during a drag; on drop
  // we read its final order back into Preact state, which becomes the
  // source of truth again for every subsequent render.
  useEffect(() => {
    if (!listRef.current) return undefined;
    sortableRef.current = Sortable.create(listRef.current, {
      animation: 220,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      handle: '.drag-handle',
      ghostClass: 'is-ghost',
      chosenClass: 'is-chosen',
      dragClass: 'is-dragging',
      forceFallback: false,
      onEnd(evt) {
        if (evt.oldIndex === evt.newIndex) return;
        setEntries((current) => {
          const next = [...current];
          const [moved] = next.splice(evt.oldIndex, 1);
          next.splice(evt.newIndex, 0, moved);
          return next;
        });
      },
    });
    return () => sortableRef.current?.destroy();
  }, []);

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
    setDownloadUrl(null);
    setAnnouncement(
      `${newEntries.length} file${newEntries.length === 1 ? '' : 's'} added.`,
    );

    // Thumbnails and PDF metadata are nice-to-have, not blocking — render
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
  }, []);

  const reset = useCallback(() => {
    setEntries([]);
    setStatus('idle');
    setProgress(0);
    setRejectedFiles([]);
    setDownloadUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
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
    setAnnouncement('Files reordered.');
  }, []);

  const handleMerge = useCallback(async () => {
    if (entries.length < 2) return;
    setStatus('merging');
    setProgress(0);
    try {
      const blob = await mergePdfs(
        entries.map((e) => e.file),
        setProgress,
      );
      setDownloadUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
      setStatus('done');
      setAnnouncement('Your merged PDF is ready to download.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('Merging failed.');
    }
  }, [entries]);

  const onInputChange = (event) => {
    addFiles(event.currentTarget.files);
    event.currentTarget.value = '';
  };

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragOver(false);
    addFiles(event.dataTransfer.files);
  };

  const hasFiles = entries.length > 0;
  const ringOffset =
    PROGRESS_RING_CIRCUMFERENCE - progress * PROGRESS_RING_CIRCUMFERENCE;

  return (
    <div class="merge-tool">
      <div
        class={`dropzone${isDragOver ? ' is-dragover' : ''}${hasFiles ? ' has-files' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
      >
        <svg
          class="dropzone-icon"
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden="true"
        >
          <rect x="9" y="4" width="24" height="32" rx="3" class="dz-page" />
          <path d="M27 4v8h8" class="dz-fold" />
          <rect x="16" y="26" width="22" height="16" rx="3" class="dz-page dz-page-front" />
          <path d="M23 30v8M27 34h-8" class="dz-plus" />
        </svg>

        {!hasFiles && (
          <p class="dropzone-text">
            <strong>Drop PDFs here</strong>
          </p>
        )}

        <label class="file-picker-button">
          {hasFiles ? 'Add more' : 'Choose files'}
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={onInputChange}
            hidden
          />
        </label>

        {!hasFiles && (
          <p class="privacy-line">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
              />
              <path
                d="M9 12.5l2 2 4-4.5"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Private. Files never leave your device.
          </p>
        )}
      </div>

      {rejectedFiles.length > 0 && (
        <p class="hint-message" role="status">
          {rejectedFiles.length === 1
            ? `Skipped “${rejectedFiles[0]}” - not a PDF.`
            : `Skipped ${rejectedFiles.length} files - not PDFs.`}
        </p>
      )}

      {hasFiles && (
        <>
          <div class="list-header">
            <span class="list-count">
              {entries.length} PDF{entries.length === 1 ? '' : 's'}
            </span>
            <button type="button" class="clear-all" onClick={reset}>
              Clear all
            </button>
          </div>

          <div class="toolbar" role="toolbar" aria-label="Sort files">
            <button type="button" onClick={() => applySort(sortByName, 'asc')}>
              A–Z
            </button>
            <button type="button" onClick={() => applySort(sortByName, 'desc')}>
              Z–A
            </button>
            <button type="button" onClick={() => applySort(sortByDate, 'asc')}>
              Oldest
            </button>
            <button type="button" onClick={() => applySort(sortByDate, 'desc')}>
              Newest
            </button>
          </div>

          <p class="sr-only" id="reorder-hint">
            Drag a file by its handle to reorder, or focus a file and press the
            arrow up or down keys to move it.
          </p>

          <ul class="file-list" ref={listRef} aria-describedby="reorder-hint">
            {entries.map((entry, index) => (
              <li key={entry.id} class="file-item" data-id={entry.id}>
                <span
                  class="drag-handle"
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
                  <img class="thumb is-loaded" src={entry.thumbnail} alt="" width="40" />
                ) : (
                  <span class="thumb thumb-placeholder" aria-hidden="true" />
                )}

                <span class="file-name">{entry.file.name}</span>

                <button
                  type="button"
                  class="remove-button"
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
            class={`merge-button${status === 'merging' ? ' is-merging' : ''}`}
            disabled={entries.length < 2 || status === 'merging'}
            onClick={handleMerge}
          >
            {status === 'merging' ? (
              <span class="merge-button-progress">
                <svg class="progress-ring" width="22" height="22" viewBox="0 0 40 40" aria-hidden="true">
                  <circle class="progress-ring-track" cx="20" cy="20" r="18" />
                  <circle
                    class="progress-ring-fill"
                    cx="20"
                    cy="20"
                    r="18"
                    stroke-dasharray={PROGRESS_RING_CIRCUMFERENCE}
                    stroke-dashoffset={ringOffset}
                  />
                </svg>
                Merging… {Math.round(progress * 100)}%
              </span>
            ) : entries.length === 1 ? (
              'Add 1 more to merge'
            ) : (
              `Merge ${entries.length} PDFs`
            )}
          </button>

          {status === 'error' && (
            <div class="error-message" role="alert">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
                <path d="M12 8v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
              <span>
                <strong>That didn't work.</strong> A file may be damaged or
                password-protected - remove it and try again.
              </span>
            </div>
          )}

          {status === 'done' && downloadUrl && (
            <>
              <a class="download-button" href={downloadUrl} download="merged.pdf">
                <svg class="download-check" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" class="check-circle" />
                  <path d="M7.5 12.5l3 3 6-6.5" class="check-mark" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                </svg>
                Download PDF
              </a>
              <button type="button" class="start-over" onClick={reset}>
                Start over
              </button>
            </>
          )}
        </>
      )}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
