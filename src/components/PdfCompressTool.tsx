import { useState } from 'preact/hooks';
import { compressPdf, compressPdfToTarget } from '../lib/compress.js';
import { useObjectUrls } from '../lib/useObjectUrls.js';
import BasePdfTool from './BasePdfTool.tsx';
import styles from './PdfCompressTool.module.css';
import pdfToolStyles from './PdfTool.module.css';
import PdfShareButton from './PdfShareButton.tsx';
import ProgressRing from './ProgressRing.tsx';
import ErrorMessage from './ErrorMessage.tsx';
import DownloadButton from './DownloadButton.tsx';
import { usePdfShare } from '../lib/usePdfShare.js';
import { describeFile } from '../lib/format.js';

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
];

const TARGET_LEVEL = {
  id: 'target',
  name: 'Target Size',
  tag: 'Choose KB',
  desc: 'Compress down to a specific file size, e.g. for a 100KB upload limit.',
  pros: 'Hits exact portal upload limits automatically',
  cons: 'Quality adjusts as needed to reach the size'
};

const TARGET_SIZE_PRESETS_KB = [100, 200, 500, 1024];

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function PdfCompressTool() {
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState('medium');
  const [targetKB, setTargetKB] = useState(100);
  const [status, setStatus] = useState('idle'); // idle | processing | done | error
  const [progress, setProgress] = useState(0);
  const { url: downloadUrl, setBlob: setDownloadBlob, clear: clearDownload } = useObjectUrls();
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [metTarget, setMetTarget] = useState(true);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const { shareReady, prepare, clearPrepared, sharePrepared } = usePdfShare();

  const resetOutput = () => {
    clearPrepared();
    setStatus('idle');
    setProgress(0);
    setCompressedSize(null);
    clearDownload();
  };

  const handleFilesAdded = (files: FileList | File[]) => {
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

  const handleLevelChange = (nextLevel: string) => {
    if (nextLevel === level) return;
    setLevel(nextLevel);
    resetOutput();
  };

  const handleTargetKBChange = (nextTargetKB: number) => {
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
      setDownloadBlob(compressedBlob);
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

  const hasFiles = !!file;

  // Calculate savings percentage
  const savingsPercent = file && compressedSize 
    ? Math.round((1 - compressedSize / file.size) * 100) 
    : 0;

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      analyticsTool="compress"
      analyticsStatus={status}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      fileLabel={file?.name}
      fileMeta={describeFile(file)}
      hasWork={status === 'done'}
      workNoun="the compressed PDF you just made"
      compact
    >
      {rejectedFiles.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {rejectedFiles.length === 1
            ? `Skipped “${rejectedFiles[0]}” - not a PDF.`
            : `Skipped ${rejectedFiles.length} files - not PDFs.`}
        </p>
      )}

      {/* Rendered whether or not a file is loaded yet: a visitor who has only
          seen the dropzone should see what the tool actually does before
          they commit to picking a file, not after. Picking a card here only
          sets `level` - it costs nothing without a file, and the choice
          carries over the moment one is dropped in. */}
      <div>
        <div class={styles['compress-options']} role="radiogroup" aria-label="Compression Options">
          {COMPRESSION_LEVELS.map((opt) => (
            <div
              key={opt.id}
              class={`${styles['compress-card']}${level === opt.id ? ` ${styles['is-selected']}` : ''}${opt.id === 'medium' ? ` ${styles['is-recommended']}` : ''}`}
              role="radio"
              aria-checked={level === opt.id}
              tabIndex={0}
              onClick={() => handleLevelChange(opt.id)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  handleLevelChange(opt.id);
                }
              }}
            >
              {opt.id === 'medium' && <span class={styles['recommended-ribbon']}>Our pick</span>}
              <div class={styles['compress-card-header']}>
                <span class={styles['compress-card-title']}>{opt.name}</span>
                <span class={styles['compress-card-tag']}>{opt.tag}</span>
              </div>
              <p class={styles['compress-card-desc']}>{opt.desc}</p>
              <div class={styles['compress-pro-con']}>
                <div class={styles['pro-item']}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span>{opt.pros}</span>
                </div>
                <div class={styles['con-item']}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                  <span>{opt.cons}</span>
                </div>
              </div>
            </div>
          ))}

          {/* Target Size is functionally different from the three presets -
              it needs a number from the user - so it gets its own full-width
              row and an icon-led header instead of blending in as a fourth
              equal card. The KB input expands inline underneath once it's
              selected, rather than in a separate panel below the grid. */}
          <div
            class={`${styles['compress-card']} ${styles['target-card']}${level === 'target' ? ` ${styles['is-selected']}` : ''}`}
            role="radio"
            aria-checked={level === 'target'}
            tabIndex={0}
            onClick={() => handleLevelChange('target')}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                handleLevelChange('target');
              }
            }}
          >
            <span class={styles['target-card-badge']}>
              Precise
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="9" r="6" />
                <path d="M9 14.2 7 22l5-3 5 3-2-7.8" />
              </svg>
            </span>
            <div class={styles['target-card-main']}>
              {/* Target/crosshair in the card body - the medal-with-ribbon
                  lives once, in the badge above, so it isn't repeated here. */}
              <span class={styles['target-card-icon']} aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="8" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="12" cy="12" r="0.5" fill="currentColor" />
                </svg>
              </span>
              <div class={styles['target-card-body']}>
                <div class={styles['compress-card-header']}>
                  <span class={styles['compress-card-title']}>{TARGET_LEVEL.name}</span>
                  <span class={styles['compress-card-tag']}>{TARGET_LEVEL.tag}</span>
                </div>
                <p class={styles['compress-card-desc']}>{TARGET_LEVEL.desc}</p>
              </div>
            </div>

            {level === 'target' && (
              <div
                class={styles['target-size-panel']}
                // Card-level onClick would otherwise fire again for every
                // click inside the input/presets - it's already selected.
                onClick={(e) => e.stopPropagation()}
              >
                <label class={styles['target-size-label']} for="target-size-input">
                  Target size
                </label>
                <div class={styles['target-size-input-row']}>
                  <input
                    id="target-size-input"
                    type="number"
                    min="10"
                    step="10"
                    value={targetKB}
                    onInput={(e) => handleTargetKBChange(Number(e.currentTarget.value))}
                  />
                  <span class={styles['target-size-unit']}>KB</span>
                </div>
                <div class={styles['target-size-presets']}>
                  {TARGET_SIZE_PRESETS_KB.map((kb) => (
                    <button
                      key={kb}
                      type="button"
                      class={`${styles['target-size-preset']}${targetKB === kb ? ` ${styles['is-selected']}` : ''}`}
                      onClick={() => handleTargetKBChange(kb)}
                    >
                      {kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {hasFiles ? (
          status !== 'done' && (
            <button
              type="button"
              class={`${pdfToolStyles['tool-primary-action']}${status === 'processing' ? ` ${pdfToolStyles['is-processing']}` : ''}`}
              disabled={status === 'processing'}
              onClick={handleCompress}
            >
              {status === 'processing' ? (
                <ProgressRing progress={progress} label="Compressing…" />
              ) : (
                'Compress PDF'
              )}
            </button>
          )
        ) : (
          <button type="button" class={pdfToolStyles['tool-primary-action']} disabled>
            Add a PDF above to compress
          </button>
        )}

        {hasFiles && status === 'error' && (
            <ErrorMessage title="Compression failed.">
              The file may be password-protected or corrupted. Please try another PDF.
            </ErrorMessage>
          )}

          {hasFiles && status === 'done' && downloadUrl && (
            <>
              <div class={styles['compression-stats']}>
                <p class={styles['stats-title']}>PDF Successfully Compressed!</p>
                <div class={styles['stats-grid']}>
                  <div class={styles['metric-item']}>
                    <span class={styles['metric-label']}>Original Size</span>
                    <span class={styles['metric-val']}>{formatBytes(file.size)}</span>
                  </div>
                  <div class={styles['metric-item']}>
                    <span class={styles['metric-label']}>Compressed Size</span>
                    <span class={styles['metric-val']}>{formatBytes(compressedSize as number)}</span>
                  </div>
                  <div class={styles['metric-item']}>
                    <span class={styles['metric-label']}>Space Saved</span>
                    <span class={styles['metric-saving']}>
                      {savingsPercent > 0 ? `Saved ${savingsPercent}%` : 'No size reduction'}
                    </span>
                  </div>
                </div>
                {level === 'target' && !metTarget && (
                  <p class={styles['compress-warning']}>
                    <strong>Closest achievable size:</strong> {formatBytes(targetKB * 1024)} couldn't be reached without making the document unreadable, so this is the smallest readable result.
                  </p>
                )}
                <p class={styles['compress-warning']}>
                  <strong>Notice:</strong> Compression rasterizes PDF pages into images to reduce file size. Embedded links and text selection/copying will be disabled on the compressed document.
                </p>
              </div>

              <DownloadButton
                href={downloadUrl}
                download={file.name.replace(/\.pdf$/i, '') + '-compressed.pdf'}
                label="Download Compressed PDF"
              />
              <PdfShareButton visible={shareReady} onShare={handleShare} label="Share Compressed PDF" />
            </>
          )}
      </div>

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
