import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { mergePdfs, resolvePdfCreationDate } from '../lib/merge.js';
import { sortByDate, sortByName } from '../lib/sort.js';
import { renderThumbnail } from '../lib/thumbnails.js';

let nextId = 0;

function toEntry(file) {
  return { id: nextId++, file, pdfCreationDate: null, thumbnail: null };
}

export default function PdfMergeTool() {
  const [entries, setEntries] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | merging | done | error
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const listRef = useRef(null);
  const sortableRef = useRef(null);

  // Drag-to-reorder: SortableJS owns the DOM order during a drag; on drop
  // we read its final order back into Preact state, which becomes the
  // source of truth again for every subsequent render.
  useEffect(() => {
    if (!listRef.current) return undefined;
    sortableRef.current = Sortable.create(listRef.current, {
      animation: 150,
      handle: '.drag-handle',
      ghostClass: 'is-dragging',
      onEnd(evt) {
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
    const pdfFiles = Array.from(fileList).filter((f) => f.type === 'application/pdf');
    if (pdfFiles.length === 0) return;

    const newEntries = pdfFiles.map(toEntry);
    setEntries((current) => [...current, ...newEntries]);
    setStatus('idle');
    setDownloadUrl(null);

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
    setEntries((current) => current.filter((e) => e.id !== id));
  }, []);

  const applySort = useCallback((sortFn, direction) => {
    setEntries((current) => sortFn(current, direction));
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
    } catch (err) {
      console.error(err);
      setStatus('error');
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

  return (
    <div class="merge-tool">
      <div
        class={`dropzone${isDragOver ? ' is-dragover' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
      >
        <p>
          <strong>Drag &amp; drop PDF files here</strong>, or
        </p>
        <label class="file-picker-button">
          Choose files
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={onInputChange}
            hidden
          />
        </label>
      </div>

      {entries.length > 0 && (
        <>
          <div class="toolbar" role="toolbar" aria-label="Sort files">
            <span class="toolbar-label">Sort by:</span>
            <button type="button" onClick={() => applySort(sortByName, 'asc')}>
              Name A–Z
            </button>
            <button type="button" onClick={() => applySort(sortByName, 'desc')}>
              Name Z–A
            </button>
            <button type="button" onClick={() => applySort(sortByDate, 'asc')}>
              Date ↑ (oldest first)
            </button>
            <button type="button" onClick={() => applySort(sortByDate, 'desc')}>
              Date ↓ (newest first)
            </button>
          </div>

          <ul class="file-list" ref={listRef}>
            {entries.map((entry) => (
              <li key={entry.id} class="file-item">
                <span class="drag-handle" aria-hidden="true">
                  ⠿
                </span>
                {entry.thumbnail ? (
                  <img class="thumb" src={entry.thumbnail} alt="" width="40" />
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
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            class="merge-button"
            disabled={entries.length < 2 || status === 'merging'}
            onClick={handleMerge}
          >
            {status === 'merging'
              ? `Merging… ${Math.round(progress * 100)}%`
              : `Merge ${entries.length} PDFs`}
          </button>

          {status === 'error' && (
            <p class="error-message" role="alert">
              Something went wrong merging these files. Make sure they're all valid PDFs.
            </p>
          )}

          {status === 'done' && downloadUrl && (
            <a class="download-button" href={downloadUrl} download="merged.pdf">
              Download merged.pdf
            </a>
          )}
        </>
      )}
    </div>
  );
}
