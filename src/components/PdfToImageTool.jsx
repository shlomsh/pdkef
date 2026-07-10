import { useEffect, useRef, useState } from 'preact/hooks';
import { convertPdfToImages, parsePageSelector } from '../lib/toImage.js';
import BasePdfTool from './BasePdfTool.jsx';
import styles from './PdfToImageTool.module.css';
import fileListStyles from './FileList.module.css';
import pdfToolStyles from './PdfTool.module.css';
import PdfShareButton from './PdfShareButton.jsx';
import { usePdfShare } from '../lib/usePdfShare.js';

const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * 18;
const SCALE_OPTIONS = [
  { value: 1, label: 'Standard', hint: '~72 DPI - smallest file size, fine for screen viewing.' },
  { value: 2, label: 'High', hint: '~144 DPI - sharp on most screens, good default for printing.' },
  { value: 3, label: 'Maximum', hint: '~216 DPI - largest file size, best for zooming in or large prints.' },
];
const LAYOUT_OPTIONS = [
  { value: 'separate', label: 'One image per page' },
  { value: 'concatenated', label: 'Single combined image' },
];

function revokeAll(images) {
  for (const image of images) URL.revokeObjectURL(image.url);
}

export default function PdfToImageTool() {
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState('image/png');
  const [scale, setScale] = useState(2);
  const [layout, setLayout] = useState('separate');
  const [pageSelector, setPageSelector] = useState('');
  const [pageSelectorError, setPageSelectorError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | converting | done | error
  const [progress, setProgress] = useState(0);
  const [images, setImages] = useState([]);
  const [announcement, setAnnouncement] = useState('');
  const { shareReady, prepareFiles, clearPrepared, sharePrepared } = usePdfShare();
  const downloadRef = useRef(null);

  useEffect(() => {
    if (status === 'done' && downloadRef.current) {
      downloadRef.current.focus();
    }
  }, [status]);

  const resetOutput = () => {
    clearPrepared();
    setStatus('idle');
    setProgress(0);
    setImages((previous) => {
      revokeAll(previous);
      return [];
    });
  };

  const handleFilesAdded = (fileList) => {
    const pdfs = Array.from(fileList).filter((f) => f.type === 'application/pdf');
    if (pdfs.length === 0) return;
    setFile(pdfs[0]);
    setPageSelector('');
    setPageSelectorError('');
    resetOutput();
  };

  const reset = () => {
    setFile(null);
    setPageSelector('');
    setPageSelectorError('');
    resetOutput();
  };

  const handlePageSelectorChange = (next) => {
    setPageSelector(next);
    setPageSelectorError('');
    resetOutput();
  };

  const handleFormatChange = (next) => {
    if (next === format) return;
    setFormat(next);
    resetOutput();
  };

  const handleScaleChange = (next) => {
    if (next === scale) return;
    setScale(next);
    resetOutput();
  };

  const handleLayoutChange = (next) => {
    if (next === layout) return;
    setLayout(next);
    resetOutput();
  };

  const handleConvert = async () => {
    if (!file) return;
    setPageSelectorError('');
    setStatus('converting');
    setProgress(0);
    try {
      const rendered = await convertPdfToImages(file, {
        format,
        scale,
        layout,
        pages: pageSelector,
        onProgress: setProgress,
      });
      setImages(rendered.map((image) => ({ ...image, url: URL.createObjectURL(image.blob) })));
      prepareFiles(rendered.map(({ blob, filename }) => ({ blob, filename, type: blob.type })));
      setStatus('done');
      setAnnouncement('Your images are ready.');
    } catch (err) {
      console.error(err);
      if (err.message?.startsWith('Invalid page selector') || err.message === 'No valid pages in range') {
        setPageSelectorError(err.message);
        setStatus('idle');
      } else {
        setStatus('error');
      }
    }
  };

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') setAnnouncement('Images shared successfully.');
    else if (result.status === 'canceled') setAnnouncement('Sharing canceled. Your images are still ready.');
    else if (result.status === 'error') setAnnouncement('Could not open the share sheet. Please try again.');
  };

  // No zip dependency is used (keeps the MIT/Apache + zero-network constraint
  // simple) - multi-page output downloads each image sequentially instead.
  const downloadAll = () => {
    images.forEach((image, index) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = image.url;
        link.download = image.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 200);
    });
  };

  const hasFiles = !!file;
  const ringOffset = PROGRESS_RING_CIRCUMFERENCE - progress * PROGRESS_RING_CIRCUMFERENCE;
  const formatLabel = format === 'image/jpeg' ? 'JPG' : 'PNG';

  return (
    <BasePdfTool hasFiles={hasFiles} onFilesAdded={handleFilesAdded} multiple={false}>
      {hasFiles && (
        <div class="tool-workspace">
          <div class={pdfToolStyles['list-header']}>
            <span class={pdfToolStyles['list-count']}>Converting: {file.name}</span>
            <button type="button" class={pdfToolStyles['clear-all']} onClick={reset}>
              Start over
            </button>
          </div>

          <div class={styles.toolbar} role="group" aria-label="Image format">
            <span class={styles['toolbar-label']}>Format</span>
            <button
              type="button"
              aria-pressed={format === 'image/png'}
              onClick={() => handleFormatChange('image/png')}
            >
              PNG
            </button>
            <button
              type="button"
              aria-pressed={format === 'image/jpeg'}
              onClick={() => handleFormatChange('image/jpeg')}
            >
              JPG
            </button>
          </div>

          <div class={styles.toolbar} role="group" aria-label="Image quality">
            <span class={styles['toolbar-label']}>Quality</span>
            {SCALE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={scale === option.value}
                onClick={() => handleScaleChange(option.value)}
              >
                {option.label}
              </button>
            ))}
            <span class="info-icon" tabIndex={0} aria-describedby="quality-tooltip">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9.25" stroke="currentColor" stroke-width="1.6" />
                <path d="M12 11v5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <circle cx="12" cy="7.75" r="1.05" fill="currentColor" />
              </svg>
              <span class="tooltip-bubble" role="tooltip" id="quality-tooltip">
                {SCALE_OPTIONS.map((option) => (
                  <span key={option.value} class="tooltip-row">
                    <strong>{option.label}</strong> {option.hint}
                  </span>
                ))}
              </span>
            </span>
          </div>

          <div class={styles.toolbar} role="group" aria-label="Output layout">
            <span class={styles['toolbar-label']}>Output</span>
            {LAYOUT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={layout === option.value}
                onClick={() => handleLayoutChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div class={pdfToolStyles['page-selector-field']}>
            <label class={pdfToolStyles['page-selector-label']} for="page-selector-input">
              Pages
            </label>
            <input
              id="page-selector-input"
              type="text"
              class={`${pdfToolStyles['page-selector-input']}${pageSelectorError ? ` ${pdfToolStyles['has-error']}` : ''}`}
              placeholder="All pages, or e.g. 1-3,5,8"
              value={pageSelector}
              onInput={(e) => handlePageSelectorChange(e.currentTarget.value)}
              aria-invalid={!!pageSelectorError}
              aria-describedby={pageSelectorError ? 'page-selector-error' : undefined}
            />
          </div>
          {pageSelectorError && (
            <p id="page-selector-error" class={pdfToolStyles['page-selector-error']} role="alert">
              {pageSelectorError}
            </p>
          )}

          <button
            type="button"
            class={`${pdfToolStyles['merge-button']}${status === 'converting' ? ` ${pdfToolStyles['is-merging']}` : ''}${status === 'done' ? ` ${pdfToolStyles['is-done']}` : ''}`}
            disabled={status === 'converting'}
            onClick={handleConvert}
          >
            {status === 'converting' ? (
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
                Converting… {Math.round(progress * 100)}%
              </span>
            ) : (
              `Convert to ${formatLabel}`
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
                <strong>That didn't work.</strong> The file may be damaged or
                password-protected - try another PDF.
              </span>
            </div>
          )}

          {status === 'done' && images.length > 0 && (
            <>
              {images.length === 1 ? (
                <a
                  ref={downloadRef}
                  class={pdfToolStyles['download-button']}
                  href={images[0].url}
                  download={images[0].filename}
                >
                  <svg class={pdfToolStyles['download-check']} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" class={pdfToolStyles['check-circle']} />
                    <path d="M7.5 12.5l3 3 6-6.5" class={pdfToolStyles['check-mark']} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                  </svg>
                  Download {formatLabel}
                </a>
              ) : (
                <>
                  <button ref={downloadRef} type="button" class={pdfToolStyles['download-button']} onClick={downloadAll}>
                    Download all {images.length} images
                  </button>
                  <ul class={fileListStyles['file-list']}>
                    {images.map((image) => (
                      <li key={image.pageNumber} class={fileListStyles['file-item']}>
                        <span class={fileListStyles['file-name']}>Page {image.pageNumber}</span>
                        <a href={image.url} download={image.filename}>
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
                label={images.length === 1 ? `Share ${formatLabel}` : `Share ${images.length} images`}
              />
              <button type="button" class={pdfToolStyles['start-over']} onClick={reset}>
                Start over
              </button>
            </>
          )}
        </div>
      )}
      <p class="sr-only" role="status" aria-live="polite">{announcement}</p>
    </BasePdfTool>
  );
}
