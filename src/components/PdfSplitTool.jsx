import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import BasePdfTool from './BasePdfTool.jsx';
import { parsePageSelector, pageNumbersToRangeString, splitPdf } from '../lib/split.js';
import styles from './PdfSplitTool.module.css';
import fileListStyles from './FileList.module.css';
import pageGridStyles from './PageGrid.module.css';
import pdfToolStyles from './PdfTool.module.css';
import PdfShareButton from './PdfShareButton.jsx';
import { usePdfShare } from '../lib/usePdfShare.js';

let pdfjsLib;
async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href;
  }
  return pdfjsLib;
}

const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * 18;

export default function PdfSplitTool() {
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pages, setPages] = useState([]); // Array of { pageNumber, selected, thumbnail }
  const [pageSelector, setPageSelector] = useState('');
  const [pageSelectorError, setPageSelectorError] = useState('');
  const [mode, setMode] = useState('combined'); // 'combined' | 'separate'
  const [status, setStatus] = useState('idle'); // idle | loading | processing | done | error
  const [progress, setProgress] = useState(0);
  const [downloadFiles, setDownloadFiles] = useState([]); // Array of { url, filename, pageNumber }
  const [rejectedFiles, setRejectedFiles] = useState([]);
  const [announcement, setAnnouncement] = useState('');
  const { shareReady, prepareFiles, clearPrepared, sharePrepared } = usePdfShare();

  const downloadRef = useRef(null);

  useEffect(() => {
    if (status === 'done' && downloadRef.current) {
      downloadRef.current.focus();
    }
  }, [status]);

  // Clean up object URLs on unmount or file change
  useEffect(() => {
    return () => {
      setDownloadFiles((prev) => {
        for (const f of prev) URL.revokeObjectURL(f.url);
        return [];
      });
    };
  }, []);

  const resetOutput = () => {
    clearPrepared();
    setStatus('idle');
    setProgress(0);
    setDownloadFiles((prev) => {
      for (const f of prev) URL.revokeObjectURL(f.url);
      return [];
    });
  };

  const loadDocumentAndThumbnails = async (pdfFile) => {
    try {
      const lib = await getPdfjs();
      const bytes = await pdfFile.arrayBuffer();
      const loadingTask = lib.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      
      const pageCount = pdf.numPages;
      setNumPages(pageCount);
      
      const initialPages = Array.from({ length: pageCount }, (_, idx) => ({
        pageNumber: idx + 1,
        selected: true,
        thumbnail: null,
      }));
      setPages(initialPages);
      setPageSelector(pageNumbersToRangeString(initialPages.map((p) => p.pageNumber)));
      setStatus('idle');
      setAnnouncement(`Loaded PDF "${pdfFile.name}" with ${pageCount} pages.`);

      // Render thumbnails one-by-one asynchronously
      for (let i = 1; i <= pageCount; i += 1) {
        try {
          const page = await pdf.getPage(i);
          const nativeViewport = page.getViewport({ scale: 1 });
          const scale = 100 / nativeViewport.width; // thumbnail width target
          const viewport = page.getViewport({ scale });
          
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          
          await page.render({ canvasContext: context, viewport }).promise;
          const url = canvas.toDataURL('image/png');
          
          setPages((current) =>
            current.map((p) => (p.pageNumber === i ? { ...p, thumbnail: url } : p)),
          );
        } catch (err) {
          console.error(`Error rendering thumbnail for page ${i}:`, err);
        }
      }
      
      await loadingTask.destroy();
    } catch (err) {
      console.error('Error loading PDF document:', err);
      setStatus('error');
      setAnnouncement('Failed to load PDF file.');
    }
  };

  const handleFilesAdded = (fileList) => {
    const incoming = Array.from(fileList);
    const pdfs = incoming.filter((f) => f.type === 'application/pdf');
    const rejected = incoming.filter((f) => f.type !== 'application/pdf');

    if (rejected.length > 0) {
      setRejectedFiles(rejected.map((f) => f.name));
    } else {
      setRejectedFiles([]);
    }

    if (pdfs.length > 0) {
      const selected = pdfs[0];
      setFile(selected);
      setStatus('loading');
      setProgress(0);
      setDownloadFiles([]);
      clearPrepared();
      setPageSelector('');
      setPageSelectorError('');
      loadDocumentAndThumbnails(selected);
    }
  };

  const reset = () => {
    setFile(null);
    setNumPages(0);
    setPages([]);
    setPageSelector('');
    setPageSelectorError('');
    setRejectedFiles([]);
    resetOutput();
    setAnnouncement('Cleared. Choose a PDF file to start again.');
  };

  const handlePageSelectorChange = (value) => {
    setPageSelector(value);
    resetOutput();
    try {
      const parsed = parsePageSelector(value, numPages);
      setPages((prev) =>
        prev.map((p) => ({ ...p, selected: parsed.includes(p.pageNumber) })),
      );
      setPageSelectorError('');
    } catch (err) {
      // If typing a partial/incomplete selector, don't show error immediately
      const isPartial = /[-,]\s*$/.test(value);
      if (!isPartial) {
        setPageSelectorError(err.message);
      } else {
        setPageSelectorError('');
      }
    }
  };

  const togglePageSelection = (pageNumber) => {
    resetOutput();
    setPages((prev) => {
      const next = prev.map((p) =>
        p.pageNumber === pageNumber ? { ...p, selected: !p.selected } : p,
      );
      const selectedNums = next.filter((p) => p.selected).map((p) => p.pageNumber);
      setPageSelector(pageNumbersToRangeString(selectedNums));
      setPageSelectorError('');
      return next;
    });
  };

  const selectAll = () => {
    resetOutput();
    setPages((prev) => {
      const next = prev.map((p) => ({ ...p, selected: true }));
      setPageSelector(pageNumbersToRangeString(next.map((p) => p.pageNumber)));
      setPageSelectorError('');
      return next;
    });
  };

  const selectNone = () => {
    resetOutput();
    setPages((prev) => {
      const next = prev.map((p) => ({ ...p, selected: false }));
      setPageSelector('');
      setPageSelectorError('No pages selected');
      return next;
    });
  };

  const handleSplit = async () => {
    if (!file) return;
    setPageSelectorError('');
    
    let activePages = [];
    try {
      activePages = parsePageSelector(pageSelector, numPages);
    } catch (err) {
      setPageSelectorError(err.message);
      return;
    }

    if (activePages.length === 0) {
      setPageSelectorError('Please select at least one page.');
      return;
    }

    setStatus('processing');
    setProgress(0);
    setAnnouncement('Splitting PDF file...');

    try {
      const results = await splitPdf(file, {
        pageNumbers: activePages,
        mode,
        onProgress: setProgress,
      });

      setDownloadFiles(
        results.map((r) => ({
          ...r,
          url: URL.createObjectURL(r.blob),
        })),
      );
      prepareFiles(results.map(({ blob, filename }) => ({ blob, filename, type: 'application/pdf' })));
      setStatus('done');
      setAnnouncement('PDF split complete. Files are ready.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('PDF split failed.');
    }
  };

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') setAnnouncement('Split PDF files shared successfully.');
    else if (result.status === 'canceled') setAnnouncement('Sharing canceled. Your PDF files are still ready.');
    else if (result.status === 'error') setAnnouncement('Could not open the share sheet. Please try again.');
  };

  const downloadAll = () => {
    downloadFiles.forEach((f, index) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = f.url;
        link.download = f.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 200);
    });
  };

  const hasFiles = !!file;
  const selectedCount = pages.filter((p) => p.selected).length;
  const ringOffset = PROGRESS_RING_CIRCUMFERENCE - progress * PROGRESS_RING_CIRCUMFERENCE;

  return (
    <BasePdfTool hasFiles={hasFiles} onFilesAdded={handleFilesAdded} multiple={false}>
      {rejectedFiles.length > 0 && (
        <p class="hint-message" role="status">
          {rejectedFiles.length === 1
            ? `Skipped “${rejectedFiles[0]}” - not a PDF.`
            : `Skipped ${rejectedFiles.length} files - not PDFs.`}
        </p>
      )}

      {hasFiles && (
        <div class="tool-workspace">
          <div class={pdfToolStyles['list-header']}>
            <span class={pdfToolStyles['list-count']}>
              File: {file.name} ({numPages} page{numPages === 1 ? '' : 's'})
            </span>
            <button type="button" class={pdfToolStyles['clear-all']} onClick={reset}>
              Start over
            </button>
          </div>

          {status === 'loading' ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-muted)' }}>
              <p>Loading document pages...</p>
            </div>
          ) : (
            <>
              <div class={styles['split-options']}>
                <h3>1. Select split mode</h3>
                <div class={styles['split-modes']} role="radiogroup" aria-label="Split mode">
                  <button
                    type="button"
                    class={`${styles['split-card']}${mode === 'combined' ? ` ${styles['is-selected']}` : ''}`}
                    onClick={() => {
                      setMode('combined');
                      resetOutput();
                    }}
                    role="radio"
                    aria-checked={mode === 'combined'}
                  >
                    <span class={styles['split-card-title']}>Extract Pages</span>
                    <span class={styles['split-card-desc']}>
                      Combine selected pages into a single new PDF document.
                    </span>
                  </button>

                  <button
                    type="button"
                    class={`${styles['split-card']}${mode === 'separate' ? ` ${styles['is-selected']}` : ''}`}
                    onClick={() => {
                      setMode('separate');
                      resetOutput();
                    }}
                    role="radio"
                    aria-checked={mode === 'separate'}
                  >
                    <span class={styles['split-card-title']}>Split into Individual Pages</span>
                    <span class={styles['split-card-desc']}>
                      Extract each selected page as its own separate PDF file.
                    </span>
                  </button>
                </div>

                <h3>2. Choose pages to extract</h3>

                <div class={pdfToolStyles['page-selector-field']}>
                  <label class={pdfToolStyles['page-selector-label']} for="page-selector-input">
                    Page range
                  </label>
                  <input
                    id="page-selector-input"
                    type="text"
                    class={`${pdfToolStyles['page-selector-input']}${pageSelectorError ? ` ${pdfToolStyles['has-error']}` : ''}`}
                    placeholder="e.g. 1-3, 5, 8-"
                    value={pageSelector}
                    onInput={(e) => handlePageSelectorChange(e.currentTarget.value)}
                    aria-invalid={!!pageSelectorError}
                    aria-describedby={pageSelectorError ? 'page-selector-error' : undefined}
                  />
                  <p class={pdfToolStyles['field-hint']}>
                    Enter page numbers or ranges separated by commas (e.g. 1-3, 5, 8-).
                  </p>
                </div>

                {pageSelectorError && (
                  <p id="page-selector-error" class={pdfToolStyles['page-selector-error']} role="alert">
                    {pageSelectorError}
                  </p>
                )}

                <div class={pageGridStyles['grid-actions']}>
                  <button type="button" onClick={selectAll}>
                    Select All
                  </button>
                  <button type="button" onClick={selectNone}>
                    Clear Selection
                  </button>
                </div>

                <div class={pageGridStyles['pages-grid']} role="group" aria-label="Visual page grid">
                  {pages.map((p) => (
                    <div
                      key={p.pageNumber}
                      class={`${pageGridStyles['page-card']}${p.selected ? ` ${pageGridStyles['is-selected']}` : ''}`}
                      onClick={() => togglePageSelection(p.pageNumber)}
                      role="checkbox"
                      aria-checked={p.selected}
                      tabIndex="0"
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          togglePageSelection(p.pageNumber);
                        }
                      }}
                    >
                      <div class={pageGridStyles['page-card-checkbox']}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>

                      <div class={pageGridStyles['page-card-thumb-container']}>
                        {p.thumbnail ? (
                          <img class={pageGridStyles['page-card-thumb']} src={p.thumbnail} alt="" />
                        ) : (
                          <div class={pdfToolStyles['thumb-placeholder']} style={{ width: '100%', height: '100%' }} />
                        )}
                      </div>
                      <span class={pageGridStyles['page-card-number']}>Page {p.pageNumber}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                class={`${pdfToolStyles['merge-button']}${status === 'processing' ? ` ${pdfToolStyles['is-merging']}` : ''}${status === 'done' ? ` ${pdfToolStyles['is-done']}` : ''}`}
                disabled={status === 'processing' || selectedCount === 0}
                onClick={handleSplit}
              >
                {status === 'processing' ? (
                  <span class={pdfToolStyles['merge-button-progress']}>
                    <svg class={pdfToolStyles['progress-ring']} width="22" height="22" viewBox="0 0 40 40" aria-hidden="true">
                      <circle class={pdfToolStyles['progress-ring-track']} cx="20" cy="20" r="18" />
                      <circle
                        class={pdfToolStyles['progress-ring-fill']}
                        cx="20"
                        cy="20"
                        r="18"
                        stroke-dasharray={PROGRESS_RING_CIRCUMFERENCE}
                        stroke-dashoffset={ringOffset}
                      />
                    </svg>
                    Splitting… {Math.round(progress * 100)}%
                  </span>
                ) : selectedCount === 0 ? (
                  'Select pages to split'
                ) : mode === 'combined' ? (
                  `Extract ${selectedCount} page${selectedCount === 1 ? '' : 's'} to single PDF`
                ) : (
                  `Split into ${selectedCount} separate PDF${selectedCount === 1 ? '' : 's'}`
                )}
              </button>

              {status === 'error' && (
                <div class={pdfToolStyles['error-message']} role="alert">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
                    <path d="M12 8v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <circle cx="12" cy="16" r="1" fill="currentColor" />
                  </svg>
                  <span>
                    <strong>That didn't work.</strong> The split operation failed. Make sure the file is not encrypted or damaged.
                  </span>
                </div>
              )}

              {status === 'done' && downloadFiles.length > 0 && (
                <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
                  {mode === 'combined' ? (
                    <a
                      ref={downloadRef}
                      class={pdfToolStyles['download-button']}
                      href={downloadFiles[0].url}
                      download={downloadFiles[0].filename}
                    >
                      <svg class={pdfToolStyles['download-check']} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" class={pdfToolStyles['check-circle']} />
                        <path d="M7.5 12.5l3 3 6-6.5" class={pdfToolStyles['check-mark']} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                      </svg>
                      Download PDF
                    </a>
                  ) : (
                    <>
                      <button
                        ref={downloadRef}
                        type="button"
                        class={pdfToolStyles['download-button']}
                        onClick={downloadAll}
                      >
                        Download all {downloadFiles.length} PDFs
                      </button>
                      <ul class={fileListStyles['file-list']} style={{ width: '100%', maxWidth: '400px', margin: '0.5rem 0' }}>
                        {downloadFiles.map((f) => (
                          <li key={f.pageNumber} class={fileListStyles['file-item']}>
                            <span class={fileListStyles['file-name']}>Page {f.pageNumber} PDF</span>
                            <a href={f.url} download={f.filename}>
                              Download
                            </a>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <PdfShareButton
                    visible={shareReady}
                    onShare={handleShare}
                    label={downloadFiles.length === 1 ? 'Share PDF' : `Share ${downloadFiles.length} PDFs`}
                  />
                  <button type="button" class={pdfToolStyles['start-over']} onClick={reset}>
                    Start over
                  </button>
                </div>
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
