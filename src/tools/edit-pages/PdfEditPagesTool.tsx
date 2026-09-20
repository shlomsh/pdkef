import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { PDFDocument } from '@cantoo/pdf-lib';
import { editPages } from './editPages.js';
import { useEditHistory } from './useEditHistory.js';
import { useHistoryShortcuts } from '../../lib/history/useHistoryShortcuts.js';
import { renderPdfThumbnails } from '../../lib/thumbnails.js';
import { useObjectUrls } from '../../lib/useObjectUrls.js';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import styles from '../../shell/PageGrid.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import PdfShareButton from '../../shell/PdfShareButton.tsx';
import ProgressRing from '../../shell/ProgressRing.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import DownloadButton from '../../shell/DownloadButton.tsx';
import { usePdfShare } from '../../lib/usePdfShare.js';
import { describeFile } from '../../lib/format.js';

interface EditPage {
  pageNumber: number;
  thumbnail: string | null;
}

interface EditState {
  pages: EditPage[];
  removedPageNums: Set<number>;
  rotations: Record<number, number>;
}

const EMPTY_EDIT_STATE: EditState = { pages: [], removedPageNums: new Set(), rotations: {} };

export default function PdfEditPagesTool() {
  const [file, setFile] = useState<File | null>(null);
  const [addPageNumbers, setAddPageNumbers] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading-file | processing | done | error
  const [progress, setProgress] = useState(0);
  const { url: downloadUrl, setBlob: setDownloadBlob, clear: clearDownload } = useObjectUrls();
  const [announcement, setAnnouncement] = useState('');
  const { shareReady, prepare, clearPrepared, sharePrepared } = usePdfShare();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const sortableRef = useRef<Sortable | null>(null);

  // Undo/redo: the hook owns the whole document (pages order, removedPageNums,
  // rotations) as `present`, plus the past/future stacks, behind one
  // useState. Every mutation site below reads `present` for rendering and
  // routes its change through `commit`, whose updater always receives the
  // live present - never a ref or a snapshot taken earlier that could have
  // gone stale. See useEditHistory.js for why that matters.
  const { present, canUndo, canRedo, commit, undo, redo, amend, reset } = useEditHistory(EMPTY_EDIT_STATE);
  const { pages, removedPageNums, rotations } = present as EditState;

  // Wire up SortableJS on the grid whenever pages are loaded
  useEffect(() => {
    if (!gridRef.current || pages.length === 0) return;
    sortableRef.current?.destroy();
    sortableRef.current = Sortable.create(gridRef.current, {
      animation: 200,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      ghostClass: styles['is-ghost'],
      chosenClass: styles['is-chosen'],
      dragClass: styles['is-dragging'],
      // Use the drag handle so rotate/remove clicks don't start drags
      handle: `.${styles['page-drag-handle']}`,
      // Always use SortableJS's own clone/ghost pipeline instead of native HTML5
      // drag-and-drop. Native DnD only leaves the dragClass on the source element
      // for a single tick before swapping to ghostClass, so on a real mouse drag
      // the styled "lifted card" look never renders - only the browser's own
      // unstyled translucent drag image does. forceFallback makes desktop and
      // touch dragging go through the same styled path.
      forceFallback: true,
      onEnd(evt: Sortable.SortableEvent) {
        if (evt.oldIndex === evt.newIndex || evt.oldIndex == null || evt.newIndex == null) return;
        commit((current: EditState) => {
          const next = [...current.pages];
          const [moved] = next.splice(evt.oldIndex as number, 1);
          next.splice(evt.newIndex as number, 0, moved);
          return { ...current, pages: next };
        });
        resetOutput();
        setAnnouncement(`Page moved from position ${(evt.oldIndex as number) + 1} to ${(evt.newIndex as number) + 1}.`);
      },
    });
    return () => sortableRef.current?.destroy();
  }, [pages.length > 0, commit]);

  const resetOutput = () => {
    clearPrepared();
    setStatus('idle');
    setProgress(0);
    clearDownload();
  };

  const handleFilesAdded = useCallback(async (fileList: FileList | File[]) => {
    const pdfs = Array.from(fileList).filter((f) => f.type === 'application/pdf');
    if (pdfs.length === 0) return;
    const selectedFile = pdfs[0];

    setFile(selectedFile);
    setStatus('loading-file');
    setProgress(0);
    setAddPageNumbers(false);
    clearDownload();
    clearPrepared();
    // A new file starts a fresh document: reset (not commit) so the previous
    // file's undo/redo stacks don't leak across files.
    reset(EMPTY_EDIT_STATE);

    try {
      const bytes = await selectedFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pageCount = pdfDoc.getPageCount();

      const initialPages = Array.from({ length: pageCount }, (_, i) => ({
        pageNumber: i + 1,
        thumbnail: null,
      }));
      reset({ pages: initialPages, removedPageNums: new Set(), rotations: {} });
      setStatus('idle');
      setAnnouncement(`Loaded PDF file "${selectedFile.name}" with ${pageCount} pages.`);

      // Render thumbnails sequentially in the background. This is not a user
      // edit, so it goes through `amend`, not `commit`: it updates the live
      // document *and* every past/future snapshot's pages, so a thumbnail
      // that finishes rendering after the user has already committed a
      // change (e.g. rotated a page) survives an undo past that commit
      // instead of reverting to the placeholder the snapshot was taken with.
      renderPdfThumbnails(selectedFile, (pageIndex: number, dataUrl: string) => {
        amend((current: EditState) => ({
          ...current,
          pages: current.pages.map((p) =>
            p.pageNumber === pageIndex ? { ...p, thumbnail: dataUrl } : p
          ),
        }));
      }).catch((err) => {
        console.error('Thumbnail generation failed:', err);
      });
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('Failed to load PDF file.');
    }
  }, [reset, amend]);

  const togglePage = useCallback((pageNum: number) => {
    commit((current: EditState) => {
      const next = new Set(current.removedPageNums);
      if (next.has(pageNum)) {
        next.delete(pageNum);
      } else {
        next.add(pageNum);
      }
      const willRemove = next.has(pageNum);
      setAnnouncement(`Page ${pageNum} marked to be ${willRemove ? 'removed' : 'kept'}.`);
      return { ...current, removedPageNums: next };
    });
    resetOutput();
  }, [commit]);

  const keepAll = useCallback(() => {
    if (removedPageNums.size === 0) return;
    commit((current: EditState) => (
      current.removedPageNums.size === 0 ? current : { ...current, removedPageNums: new Set() }
    ));
    resetOutput();
    setAnnouncement('Marked all pages to be kept.');
  }, [commit, removedPageNums]);

  const removeAll = useCallback(() => {
    if (removedPageNums.size === pages.length) return;
    commit((current: EditState) => {
      const all = new Set(current.pages.map((p) => p.pageNumber));
      return current.removedPageNums.size === all.size ? current : { ...current, removedPageNums: all };
    });
    resetOutput();
    setAnnouncement('Marked all pages to be removed.');
  }, [commit, pages.length, removedPageNums]);

  const rotatePage = useCallback((pageNum: number, direction: string) => {
    commit((current: EditState) => {
      const currentRot = current.rotations[pageNum] || 0;
      const nextRot = direction === 'left' ? currentRot - 90 : currentRot + 90;
      return { ...current, rotations: { ...current.rotations, [pageNum]: nextRot } };
    });
    resetOutput();
    setAnnouncement(`Page ${pageNum} rotated ${direction}.`);
  }, [commit]);

  const invertSelection = useCallback(() => {
    commit((current: EditState) => {
      const next: Set<number> = new Set();
      current.pages.forEach((p) => {
        if (!current.removedPageNums.has(p.pageNumber)) {
          next.add(p.pageNumber);
        }
      });
      return { ...current, removedPageNums: next };
    });
    resetOutput();
    setAnnouncement('Inverted page selections.');
  }, [commit]);

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    undo();
    resetOutput();
    setAnnouncement('Undid last change.');
  }, [undo, canUndo]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    redo();
    resetOutput();
    setAnnouncement('Redid last change.');
  }, [redo, canRedo]);

  // Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z, through the same hook Sign and Redact
  // use. The `canUndo`/`canRedo` guards here are only a courtesy (skip the
  // announcement when the button is disabled); correctness under repeated
  // same-task keydowns - ordinary key auto-repeat, which this hook does not
  // suppress - comes from `undo`/`redo` themselves, which read the live
  // past/future through a functional update and no-op safely with no extra
  // history entry once there is truly nothing left to undo/redo (see
  // useEditHistory.js). The hook stands down while focus is in an input,
  // which here means the page-numbers checkbox.
  useHistoryShortcuts(handleUndo, handleRedo);

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
      setDownloadBlob(blob);
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

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      analyticsTool="edit-pdf"
      analyticsStatus={status}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      fileLabel={file?.name}
      fileMeta={describeFile(file, pages.length)}
    >
      {hasFiles && (
        <div class="tool-workspace">
          {status === 'loading-file' ? (
            <div class={pdfToolStyles['status-block']}>
              <p class={pdfToolStyles['status-text-muted']}>Loading PDF file structure…</p>
            </div>
          ) : (
            <>
              <div class={styles['grid-actions']} role="toolbar" aria-label="Selection toolbar">
                <button type="button" onClick={keepAll}>
                  Keep all
                </button>
                <button type="button" onClick={removeAll}>
                  Remove all
                </button>
                <button type="button" onClick={invertSelection}>
                  Invert
                </button>
                <button type="button" onClick={handleUndo} disabled={!canUndo} aria-label="Undo last change">
                  Undo
                </button>
                <button type="button" onClick={handleRedo} disabled={!canRedo} aria-label="Redo last undone change">
                  Redo
                </button>
                <label class={pdfToolStyles['page-numbers-toggle']}>
                  <input
                    type="checkbox"
                    checked={addPageNumbers}
                    onChange={(e) => {
                      setAddPageNumbers((e.target as HTMLInputElement).checked);
                      resetOutput();
                    }}
                  />
                  <span>Add page numbers</span>
                </label>
                <span class={styles['grid-actions-hint']} aria-hidden="true">Drag to reorder</span>
              </div>

              <div class={styles['pages-grid']} role="group" aria-label="PDF Pages Grid" ref={gridRef}>
                {pages.map((page) => {
                  const isRemoved = removedPageNums.has(page.pageNumber);
                  const rotation = rotations[page.pageNumber] || 0;
                  return (
                    <div
                      key={page.pageNumber}
                      class={`${styles['page-card']}${isRemoved ? ` ${styles['is-removed']}` : ` ${styles['is-selected']}`}`}
                      data-page={page.pageNumber}
                      onClick={() => togglePage(page.pageNumber)}
                    >
                      {/* Drag handle - full-width top bar */}
                      <span
                        class={styles['page-drag-handle']}
                        title="Drag to reorder"
                        aria-hidden="true"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <circle cx="5" cy="3" r="1.4" fill="currentColor" />
                          <circle cx="11" cy="3" r="1.4" fill="currentColor" />
                          <circle cx="5" cy="8" r="1.4" fill="currentColor" />
                          <circle cx="11" cy="8" r="1.4" fill="currentColor" />
                          <circle cx="5" cy="13" r="1.4" fill="currentColor" />
                          <circle cx="11" cy="13" r="1.4" fill="currentColor" />
                        </svg>
                      </span>

                      {/* Toggle remove / keep by clicking the checkbox badge */}
                      <button
                        type="button"
                        class={styles['page-card-checkbox']}
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

                      <div class={styles['page-card-thumb-container']}>
                        {page.thumbnail ? (
                          <img
                            class={styles['page-card-thumb']}
                            src={page.thumbnail}
                            alt=""
                            style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s ease' }}
                          />
                        ) : (
                          <span class={`${pdfToolStyles['thumb-placeholder']} ${pdfToolStyles['thumb-placeholder-fill']}`} />
                        )}
                      </div>

                      <span class={styles['page-card-number']}>Page {page.pageNumber}</span>

                      <div class={styles['page-card-actions']} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          class={styles['rotate-btn']}
                          onClick={(e) => { e.stopPropagation(); rotatePage(page.pageNumber, 'left'); }}
                          aria-label={`Rotate page ${page.pageNumber} left`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                        </button>
                        <button
                          type="button"
                          class={styles['rotate-btn']}
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
                <p
                  class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.centered} ${pdfToolStyles.danger}`}
                  role="status"
                >
                  A PDF must contain at least one page. Please keep at least one page.
                </p>
              )}


              {!hasEdits && (
                <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.centered}`} role="status">
                  Remove pages, rotate, reorder, or add page numbers before applying changes.
                </p>
              )}

              <button
                type="button"
                class={`${pdfToolStyles['tool-primary-action']}${status === 'processing' ? ` ${pdfToolStyles['is-processing']}` : ''}${status === 'done' ? ` ${pdfToolStyles['is-done']}` : ''}`}
                disabled={actionButtonDisabled}
                onClick={handleApplyChanges}
              >
                {status === 'processing' ? (
                  <ProgressRing progress={progress} label="Processing…" />
                ) : (
                  actionButtonText
                )}
              </button>

              {status === 'error' && (
                <ErrorMessage>
                  The file may be damaged or password-protected - try another PDF.
                </ErrorMessage>
              )}

              {status === 'done' && downloadUrl && (
                <>
                  <DownloadButton
                    href={downloadUrl}
                    download={`${file.name.replace(/\.pdf$/i, '')}_modified.pdf`}
                  />
                  <PdfShareButton visible={shareReady} onShare={handleShare} />
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
