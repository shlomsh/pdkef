import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { compressPdf, compressPdfToTarget } from '../lib/compress.js';
import BasePdfTool from './BasePdfTool.jsx';
import PdfShareButton from './PdfShareButton.jsx';
import { usePdfShare } from '../lib/usePdfShare.js';

const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * 18;

const COMPRESSION_LEVELS = [
  {
    id: 'high',
    name: 'Extreme Compression',
    tag: 'Smallest Size',
    desc: 'Maximum file size reduction. Images will be downscaled to 72 DPI.',
    pros: 'Smallest file size (60-80% reduction)',
    cons: 'Lower resolution, images may look pixelated/fuzzy'
  },
  {
    id: 'medium',
    name: 'Recommended',
    tag: 'Good Quality',
    desc: 'Optimal balance between size reduction and visual quality.',
    pros: 'Excellent balance of size reduction (40-60%) & clarity',
    cons: 'Slight loss of crispness when zoomed in'
  },
  {
    id: 'low',
    name: 'High Quality',
    tag: 'High Quality',
    desc: 'Minimal compression. Keeps images crisp and clear at 150 DPI.',
    pros: 'Crisp images and clear text, close to original quality',
    cons: 'Minimal size reduction (10-30%)'
  },
  {
    id: 'target',
    name: 'Target Size',
    tag: 'Choose KB',
    desc: 'Compress down to a specific file size, e.g. for a 100KB upload limit.',
    pros: 'Hits exact portal upload limits automatically',
    cons: 'Quality adjusts as needed to reach the size'
  }
];

const TARGET_SIZE_PRESETS_KB = [100, 200, 500, 1024];

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function PdfCompressTool() {
  const [file, setFile] = useState(null);
  const [level, setLevel] = useState('medium');
  const [targetKB, setTargetKB] = useState(100);
  const [status, setStatus] = useState('idle'); // idle | processing | done | error
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [compressedSize, setCompressedSize] = useState(null);
  const [metTarget, setMetTarget] = useState(true);
  const [rejectedFiles, setRejectedFiles] = useState([]);
  const [announcement, setAnnouncement] = useState('');
  const { canSharePdf, shareReady, prepare, clearPrepared, sharePrepared } = usePdfShare();
  
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
    setCompressedSize(null);
    setDownloadUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  };

  const handleFilesAdded = (files) => {
    const incoming = Array.from(files);
    const pdfs = incoming.filter(f => f.type === 'application/pdf');
    const rejected = incoming.filter(f => f.type !== 'application/pdf');

    if (rejected.length > 0) {
      setRejectedFiles(rejected.map(f => f.name));
    } else {
      setRejectedFiles([]);
    }

    if (pdfs.length > 0) {
      setFile(pdfs[0]);
      resetOutput();
      setAnnouncement(`File "${pdfs[0].name}" loaded. Select a compression option to continue.`);
    }
  };

  const handleLevelChange = (nextLevel) => {
    if (nextLevel === level) return;
    setLevel(nextLevel);
    resetOutput();
  };

  const handleTargetKBChange = (nextTargetKB) => {
    setTargetKB(Number.isFinite(nextTargetKB) && nextTargetKB > 0 ? nextTargetKB : 1);
    resetOutput();
  };

  const handleCompress = async () => {
    if (!file) return;
    setStatus('processing');
    setProgress(0);
    setAnnouncement('Starting PDF compression...');

    try {
      let compressedBlob;
      let didMeetTarget = true;

      if (level === 'target') {
        const result = await compressPdfToTarget(file, {
          targetKB,
          onProgress: setProgress,
        });
        compressedBlob = result.blob;
        didMeetTarget = result.metTarget;
      } else {
        compressedBlob = await compressPdf(file, {
          level,
          onProgress: setProgress,
        });
      }

      setCompressedSize(compressedBlob.size);
      setMetTarget(didMeetTarget);
      setDownloadUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(compressedBlob);
      });
      prepare(compressedBlob, file.name.replace(/\.pdf$/i, '') + '-compressed.pdf');
      setStatus('done');
      setAnnouncement('PDF compression complete. Your file is ready.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement('PDF compression failed.');
    }
  };

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') setAnnouncement('Compressed PDF shared successfully.');
    else if (result.status === 'canceled') setAnnouncement('Sharing canceled. Your compressed PDF is still ready.');
    else if (result.status === 'error') setAnnouncement('Could not open the share sheet. Please try again.');
  };

  const reset = () => {
    setFile(null);
    setRejectedFiles([]);
    resetOutput();
    setAnnouncement('Cleared. Choose a PDF file to start again.');
  };

  const hasFiles = !!file;
  const ringOffset = PROGRESS_RING_CIRCUMFERENCE - progress * PROGRESS_RING_CIRCUMFERENCE;

  // Calculate savings percentage
  const savingsPercent = file && compressedSize 
    ? Math.round((1 - compressedSize / file.size) * 100) 
    : 0;

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
          <div class="list-header">
            <span class="list-count">File: {file.name} ({formatBytes(file.size)})</span>
            <button type="button" class="clear-all" onClick={reset}>
              Start over
            </button>
          </div>

          <div class="compress-options" role="radiogroup" aria-label="Compression Options">
            {COMPRESSION_LEVELS.map((opt) => (
              <div
                key={opt.id}
                class={`compress-card${level === opt.id ? ' is-selected' : ''}`}
                role="radio"
                aria-checked={level === opt.id}
                tabIndex="0"
                onClick={() => handleLevelChange(opt.id)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    handleLevelChange(opt.id);
                  }
                }}
              >
                <div class="compress-card-header">
                  <span class="compress-card-title">{opt.name}</span>
                  <span class="compress-card-tag">{opt.tag}</span>
                </div>
                <p class="compress-card-desc">{opt.desc}</p>
                <div class="compress-pro-con">
                  <div class="pro-item">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>{opt.pros}</span>
                  </div>
                  <div class="con-item">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                    <span>{opt.cons}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {level === 'target' && (
            <div class="target-size-panel">
              <label class="target-size-label" for="target-size-input">
                Target size
              </label>
              <div class="target-size-input-row">
                <input
                  id="target-size-input"
                  type="number"
                  min="10"
                  step="10"
                  value={targetKB}
                  onInput={(e) => handleTargetKBChange(Number(e.currentTarget.value))}
                />
                <span class="target-size-unit">KB</span>
              </div>
              <div class="target-size-presets">
                {TARGET_SIZE_PRESETS_KB.map((kb) => (
                  <button
                    key={kb}
                    type="button"
                    class={`target-size-preset${targetKB === kb ? ' is-selected' : ''}`}
                    onClick={() => handleTargetKBChange(kb)}
                  >
                    {kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {status !== 'done' && (
            <button
              type="button"
              class={`merge-button${status === 'processing' ? ' is-merging' : ''}`}
              disabled={status === 'processing'}
              onClick={handleCompress}
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
                  Compressing… {Math.round(progress * 100)}%
                </span>
              ) : (
                'Compress PDF'
              )}
            </button>
          )}

          {status === 'error' && (
            <div class="error-message" role="alert">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
                <path d="M12 8v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
              <span>
                <strong>Compression failed.</strong> The file may be password-protected or corrupted. Please try another PDF.
              </span>
            </div>
          )}

          {status === 'done' && downloadUrl && (
            <>
              <div class="compression-stats">
                <p class="stats-title">PDF Successfully Compressed!</p>
                <div class="stats-grid">
                  <div class="metric-item">
                    <span class="metric-label">Original Size</span>
                    <span class="metric-val">{formatBytes(file.size)}</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Compressed Size</span>
                    <span class="metric-val">{formatBytes(compressedSize)}</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-label">Space Saved</span>
                    <span class="metric-saving">
                      {savingsPercent > 0 ? `Saved ${savingsPercent}%` : 'No size reduction'}
                    </span>
                  </div>
                </div>
                {level === 'target' && !metTarget && (
                  <p class="compress-warning">
                    <strong>Closest achievable size:</strong> {formatBytes(targetKB * 1024)} couldn't be reached without making the document unreadable, so this is the smallest readable result.
                  </p>
                )}
                <p class="compress-warning">
                  <strong>Notice:</strong> Compression rasterizes PDF pages into images to reduce file size. Embedded links and text selection/copying will be disabled on the compressed document.
                </p>
              </div>

              <a
                ref={downloadRef}
                class="download-button"
                href={downloadUrl}
                download={file.name.replace(/\.pdf$/i, '') + '-compressed.pdf'}
              >
                <svg class="download-check" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" class="check-circle" />
                  <path d="M7.5 12.5l3 3 6-6.5" class="check-mark" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                </svg>
                Download Compressed PDF
              </a>
              <PdfShareButton visible={canSharePdf && shareReady} onShare={handleShare} label="Share Compressed PDF" />
              <button type="button" class="start-over" onClick={reset}>
                Start over
              </button>
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
