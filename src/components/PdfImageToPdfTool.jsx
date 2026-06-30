import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { imagesToPdf } from '../lib/imageToPdf.js';
import { sortByDate, sortByName } from '../lib/sort.js';
import BasePdfTool from './BasePdfTool.jsx';

let nextId = 0;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];

function toEntry(file) {
  return { id: nextId++, file, thumbnail: URL.createObjectURL(file) };
}

const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * 18;

export default function PdfImageToPdfTool() {
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | converting | done | error
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [rejectedFiles, setRejectedFiles] = useState([]);
  const [announcement, setAnnouncement] = useState('');
  const listRef = useRef(null);
  const sortableRef = useRef(null);
  const downloadRef = useRef(null);

  useEffect(() => {
    if (status === 'done' && downloadRef.current) {
      downloadRef.current.focus();
    }
  }, [status]);

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
        setStatus('idle');
        setDownloadUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return null;
        });
      },
    });
    return () => sortableRef.current?.destroy();
  }, [entries.length > 0]);

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList);
    const imageFiles = incoming.filter((f) => ACCEPTED_TYPES.includes(f.type));
    const rejected = incoming.filter((f) => !ACCEPTED_TYPES.includes(f.type));

    setRejectedFiles(rejected.length > 0 ? rejected.map((f) => f.name) : []);

    if (imageFiles.length === 0) return;

    const newEntries = imageFiles.map(toEntry);
    setEntries((current) => [...current, ...newEntries]);
    setStatus('idle');
    setDownloadUrl(null);
    setAnnouncement(
      `${newEntries.length} image${newEntries.length === 1 ? '' : 's'} added.`,
    );
  }, []);

  const removeEntry = useCallback((id) => {
    setEntries((current) => {
      const removed = current.find((e) => e.id === id);
      if (removed) {
        setAnnouncement(`${removed.file.name} removed.`);
        URL.revokeObjectURL(removed.thumbnail);
      }
      return current.filter((e) => e.id !== id);
    });
    setStatus('idle');
    setDownloadUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }, []);

  const reset = useCallback(() => {
    setEntries((current) => {
      for (const entry of current) URL.revokeObjectURL(entry.thumbnail);
      return [];
    });
    setStatus('idle');
    setProgress(0);
    setRejectedFiles([]);
    setDownloadUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setAnnouncement('Cleared. Add images to start again.');
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
    setDownloadUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
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
    setStatus('idle');
    setDownloadUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
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
      setDownloadUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
      setStatus('done');
      setAnnouncement('Your PDF is ready to download.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('Conversion failed.');
    }
  }, [entries]);

  const hasFiles = entries.length > 0;
  const ringOffset =
    PROGRESS_RING_CIRCUMFERENCE - progress * PROGRESS_RING_CIRCUMFERENCE;

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      onFilesAdded={addFiles}
      accept="image/jpeg,image/png"
      emptyStateMessage="Drop images here"
    >
      {rejectedFiles.length > 0 && (
        <p class="hint-message" role="status">
          {rejectedFiles.length === 1
            ? `Skipped “${rejectedFiles[0]}” - not a JPG or PNG.`
            : `Skipped ${rejectedFiles.length} files - not JPG or PNG.`}
        </p>
      )}

      {hasFiles && (
        <>
          <div class="list-header">
            <span class="list-count">
              {entries.length} image{entries.length === 1 ? '' : 's'}
            </span>
            <button type="button" class="clear-all" onClick={reset}>
              Clear all
            </button>
          </div>

          <div class="toolbar" role="toolbar" aria-label="Sort images">
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
            Drag an image by its handle to reorder, or focus an image and press
            the arrow up or down keys to move it.
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

                <img class="thumb is-loaded" src={entry.thumbnail} alt="" width="40" />

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
            class={`merge-button${status === 'converting' ? ' is-merging' : ''}${status === 'done' ? ' is-done' : ''}`}
            disabled={entries.length === 0 || status === 'converting'}
            onClick={handleConvert}
          >
            {status === 'converting' ? (
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
                Converting… {Math.round(progress * 100)}%
              </span>
            ) : (
              `Convert ${entries.length} image${entries.length === 1 ? '' : 's'} to PDF`
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
                <strong>That didn't work.</strong> A file may be damaged - remove
                it and try again.
              </span>
            </div>
          )}

          {status === 'done' && downloadUrl && (
            <>
              <a
                ref={downloadRef}
                class="download-button"
                href={downloadUrl}
                download="images.pdf"
              >
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
    </BasePdfTool>
  );
}
