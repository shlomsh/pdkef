import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { PDFDocument } from '@cantoo/pdf-lib';
import { editPages } from '../lib/editPages.js';
import { renderPdfThumbnails } from '../lib/thumbnails.js';
import BasePdfTool from './BasePdfTool.jsx';
import PdfShareButton from './PdfShareButton.jsx';
import { usePdfShare } from '../lib/usePdfShare.js';

const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * 18;

export default function PdfEditPagesTool() {
  const [file, setFile] = useState(null);
  // pages: array of { pageNumber, thumbnail } - ORDER is the final page order
  const [pages, setPages] = useState([]);
  // removedPageNums: Set of original page numbers (1-indexed) marked for removal
  const [removedPageNums, setRemovedPageNums] = useState(new Set());
  // rotations: { [pageNumber]: degrees } - keyed by original page number
  const [rotations, setRotations] = useState({});
  const [addPageNumbers, setAddPageNumbers] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading-file | processing | done | error
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const { canSharePdf, shareReady, prepare, clearPrepared, sharePrepared } = usePdfShare();
  const gridRef = useRef(null);
  const sortableRef = useRef(null);
  const downloadRef = useRef(null);

  useEffect(() => {
    if (status === 'done' && downloadRef.current) {
      downloadRef.current.focus();
    }
  }, [status]);

  // Wire up SortableJS on the grid whenever pages are loaded
  useEffect(() => {
    if (!gridRef.current || pages.length === 0) return;
    sortableRef.current?.destroy();
    sortableRef.current = Sortable.create(gridRef.current, {
      animation: 200,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      ghostClass: 'is-ghost',
      chosenClass: 'is-chosen',
      dragClass: 'is-dragging',
      // Use the drag handle so rotate/remove clicks don't start drags
      handle: '.page-drag-handle',
      onEnd(evt) {
        if (evt.oldIndex === evt.newIndex) return;
        setPages((current) => {
          const next = [...current];
          const [moved] = next.splice(evt.oldIndex, 1);
          next.splice(evt.newIndex, 0, moved);
          return next;
        });
        resetOutput();
        setAnnouncement(`Page moved from position ${evt.oldIndex + 1} to ${evt.newIndex + 1}.`);
      },
    });
    return () => sortableRef.current?.destroy();
  }, [pages.length > 0]);

  const resetOutput = () => {
    clearPrepared();
    setStatus('idle');
    setProgress(0);
    setDownloadUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  };

  const handleFilesAdded = useCallback(async (fileList) => {
    const pdfs = Array.from(fileList).filter((f) => f.type === 'application/pdf');
    if (pdfs.length === 0) return;
    const selectedFile = pdfs[0];

    setFile(selectedFile);
    setStatus('loading-file');
    setProgress(0);
    setRemovedPageNums(new Set());
    setRotations({});
    setAddPageNumbers(false);
    setDownloadUrl(null);
    clearPrepared();
    setPages([]);

    try {
      const bytes = await selectedFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pageCount = pdfDoc.getPageCount();

      const initialPages = Array.from({ length: pageCount }, (_, i) => ({
        pageNumber: i + 1,
        thumbnail: null,
      }));
      setPages(initialPages);
      setStatus('idle');
      setAnnouncement(`Loaded PDF file "${selectedFile.name}" with ${pageCount} pages.`);

      // Render thumbnails sequentially in the background
      renderPdfThumbnails(selectedFile, (pageIndex, dataUrl) => {
        setPages((current) =>
          current.map((p) =>
            p.pageNumber === pageIndex ? { ...p, thumbnail: dataUrl } : p
          )
        );
      }).catch((err) => {
        console.error('Thumbnail generation failed:', err);
      });
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('Failed to load PDF file.');
    }
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setPages([]);
    setRemovedPageNums(new Set());
    setRotations({});
    setAddPageNumbers(false);
    setStatus('idle');
    setProgress(0);
    clearPrepared();
    setDownloadUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setAnnouncement('Cleared. Add a PDF to start again.');
  }, []);

  const togglePage = useCallback((pageNum) => {
    setRemovedPageNums((current) => {
      const next = new Set(current);
      if (next.has(pageNum)) {
        next.delete(pageNum);
      } else {
        next.add(pageNum);
      }
      const willRemove = next.has(pageNum);
      setAnnouncement(`Page ${pageNum} marked to be ${willRemove ? 'removed' : 'kept'}.`);
      return next;
    });
    resetOutput();
  }, []);

  const keepAll = useCallback(() => {
    setRemovedPageNums(new Set());
    resetOutput();
    setAnnouncement('Marked all pages to be kept.');
  }, []);

  const removeAll = useCallback(() => {
    const all = new Set(pages.map((p) => p.pageNumber));
    setRemovedPageNums(all);
    resetOutput();
    setAnnouncement('Marked all pages to be removed.');
  }, [pages]);

  const rotatePage = useCallback((pageNum, direction) => {
    setRotations((current) => {
      const currentRot = current[pageNum] || 0;
      const nextRot = direction === 'left' ? currentRot - 90 : currentRot + 90;
      return { ...current, [pageNum]: nextRot };
    });
    resetOutput();
    setAnnouncement(`Page ${pageNum} rotated ${direction}.`);
  }, []);

  const invertSelection = useCallback(() => {
    setRemovedPageNums((current) => {
      const next = new Set();
      pages.forEach((p) => {
        if (!current.has(p.pageNumber)) {
          next.add(p.pageNumber);
        }
      });
      return next;
    });
    resetOutput();
    setAnnouncement('Inverted page selections.');
  }, [pages]);

  const handleApplyChanges = async () => {
    if (!file || removedPageNums.size === pages.length) return;
    setStatus('processing');
    setProgress(0);
    try {
      // Pass the final ordered page list and per-pageNumber state
      const options = {
        pageOrder: pages.map((p) => p.pageNumber), // final desired order (1-indexed)
        removedPageNums,
        rotations,
        addPageNumbers,
      };
      const blob = await editPages(file, options, setProgress);
      setDownloadUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
      prepare(blob, `${file.name.replace(/\.pdf$/i, '')}_modified.pdf`);
      setStatus('done');
      setAnnouncement('Your modified PDF is ready.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('Failed to edit PDF.');
    }
  };

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') setAnnouncement('Modified PDF shared successfully.');
    else if (result.status === 'canceled') setAnnouncement('Sharing canceled. Your modified PDF is still ready.');
    else if (result.status === 'error') setAnnouncement('Could not open the share sheet. Please try again.');
  };

  const hasFiles = !!file;
  const isAllRemoved = removedPageNums.size === pages.length && pages.length > 0;
  const pageOrderChanged = pages.some((p, i) => p.pageNumber !== i + 1);
  const hasEdits = removedPageNums.size > 0 || Object.keys(rotations).length > 0 || addPageNumbers || pageOrderChanged;
  const actionButtonDisabled = isAllRemoved || !hasEdits || status === 'processing';

  let actionButtonText = 'Apply Changes';
  if (status === 'processing') {
    actionButtonText = 'Processing…';
  } else if (isAllRemoved) {
    actionButtonText = 'Cannot remove all pages';
  } else if (!hasEdits) {
    actionButtonText = 'Make edits to apply';
  }

  const ringOffset = PROGRESS_RING_CIRCUMFERENCE - progress * PROGRESS_RING_CIRCUMFERENCE;

  return (
    <BasePdfTool hasFiles={hasFiles} onFilesAdded={handleFilesAdded} multiple={false}>
      {hasFiles && (
        <div class="tool-workspace">
          <div class="list-header">
            <span class="list-count">
              {file.name} ({pages.length} page{pages.length === 1 ? '' : 's'})
            </span>
            <button type="button" class="clear-all" onClick={reset}>
              Start over
            </button>
          </div>

          {status === 'loading-file' ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--color-muted)' }}>Loading PDF file structure…</p>
            </div>
          ) : (
            <>
              <div class="grid-actions" role="toolbar" aria-label="Selection toolbar">
                <button type="button" onClick={keepAll}>
                  Keep all
                </button>
                <button type="button" onClick={removeAll}>
                  Remove all
                </button>
                <button type="button" onClick={invertSelection}>
                  Invert
                </button>
                <label class="page-numbers-toggle">
                  <input
                    type="checkbox"
                    checked={addPageNumbers}
                    onChange={(e) => {
                      setAddPageNumbers(e.target.checked);
                      resetOutput();
                    }}
                  />
                  <span>Add page numbers</span>
                </label>
                <span class="grid-actions-hint" aria-hidden="true">Drag to reorder</span>
              </div>

              <div class="pages-grid" role="group" aria-label="PDF Pages Grid" ref={gridRef}>
                {pages.map((page) => {
                  const isRemoved = removedPageNums.has(page.pageNumber);
                  const rotation = rotations[page.pageNumber] || 0;
                  return (
                    <div
                      key={page.pageNumber}
                      class={`page-card${isRemoved ? ' is-removed' : ' is-selected'}`}
                      data-page={page.pageNumber}
                      onClick={() => togglePage(page.pageNumber)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Drag handle - full-width top bar */}
                      <span
                        class="page-drag-handle"
                        title="Drag to reorder"
                        aria-hidden="true"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor">
                          <rect x="0" y="0" width="16" height="1.5" rx="0.75"/>
                          <rect x="0" y="4.25" width="16" height="1.5" rx="0.75"/>
                          <rect x="0" y="8.5" width="16" height="1.5" rx="0.75"/>
                        </svg>
                      </span>

                      {/* Toggle remove / keep by clicking the checkbox badge */}
                      <button
                        type="button"
                        class="page-card-checkbox"
                        onClick={(e) => { e.stopPropagation(); togglePage(page.pageNumber); }}
                        aria-label={`Page ${page.pageNumber}${isRemoved ? ', marked for removal' : ', kept'}. Click to toggle.`}
                        aria-pressed={isRemoved}
                      >
                        {!isRemoved ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        )}
                      </button>

                      <div class="page-card-thumb-container" style={{ cursor: 'pointer' }}>
                        {page.thumbnail ? (
                          <img
                            class="page-card-thumb"
                            src={page.thumbnail}
                            alt=""
                            style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s ease' }}
                          />
                        ) : (
                          <span class="thumb-placeholder" style={{ width: '100%', height: '100%' }} />
                        )}
                      </div>

                      <span class="page-card-number">Page {page.pageNumber}</span>

                      <div class="page-card-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          class="rotate-btn"
                          onClick={(e) => { e.stopPropagation(); rotatePage(page.pageNumber, 'left'); }}
                          aria-label={`Rotate page ${page.pageNumber} left`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                        </button>
                        <button
                          type="button"
                          class="rotate-btn"
                          onClick={(e) => { e.stopPropagation(); rotatePage(page.pageNumber, 'right'); }}
                          aria-label={`Rotate page ${page.pageNumber} right`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {isAllRemoved && (
                <p class="hint-message" role="status" style={{ color: 'var(--color-danger)', textAlign: 'center', marginTop: '0.5rem' }}>
                  A PDF must contain at least one page. Please keep at least one page.
                </p>
              )}


              {!hasEdits && (
                <p class="hint-message" role="status" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                  Remove pages, rotate, reorder, or add page numbers before applying changes.
                </p>
              )}

              <button
                type="button"
                class={`merge-button${status === 'processing' ? ' is-merging' : ''}${status === 'done' ? ' is-done' : ''}`}
                disabled={actionButtonDisabled}
                onClick={handleApplyChanges}
              >
                {status === 'processing' ? (
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
                    Processing… {Math.round(progress * 100)}%
                  </span>
                ) : (
                  actionButtonText
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
                    <strong>That didn't work.</strong> The file may be damaged or
                    password-protected - try another PDF.
                  </span>
                </div>
              )}

              {status === 'done' && downloadUrl && (
                <>
                  <a
                    ref={downloadRef}
                    class="download-button"
                    href={downloadUrl}
                    download={`${file.name.replace(/\.pdf$/i, '')}_modified.pdf`}
                  >
                    <svg class="download-check" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" class="check-circle" />
                      <path d="M7.5 12.5l3 3 6-6.5" class="check-mark" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                    </svg>
                    Download PDF
                  </a>
                  <PdfShareButton visible={canSharePdf && shareReady} onShare={handleShare} />
                  <button type="button" class="start-over" onClick={reset}>
                    Start over
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
