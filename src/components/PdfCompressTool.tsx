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
import { englishCompressMessages, formatMessage, type CompressMessages } from '../i18n/toolMessages';

const TARGET_SIZE_PRESETS_KB = [100, 200, 500, 1024];

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface PdfCompressToolProps {
  /** LOC-02: server-rendered by src/pages/[locale]/[tool].astro for a
   * localized edition; every key not overridden keeps the English default. */
  messages?: Partial<CompressMessages>;
}

export default function PdfCompressTool({ messages: messagesProp }: PdfCompressToolProps = {}) {
  const t: CompressMessages = { ...englishCompressMessages, ...messagesProp };

  const COMPRESSION_LEVELS = [
    { id: 'high', name: t.levelHighName, tag: t.levelHighTag, desc: t.levelHighDesc, pros: t.levelHighPros, cons: t.levelHighCons },
    { id: 'medium', name: t.levelMediumName, tag: t.levelMediumTag, desc: t.levelMediumDesc, pros: t.levelMediumPros, cons: t.levelMediumCons },
    { id: 'low', name: t.levelLowName, tag: t.levelLowTag, desc: t.levelLowDesc, pros: t.levelLowPros, cons: t.levelLowCons },
  ];
  const TARGET_LEVEL = { id: 'target', name: t.targetName, tag: t.targetTag, desc: t.targetDesc, pros: t.targetPros, cons: t.targetCons };

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
      setAnnouncement(formatMessage(t.loaded, { name: pdfs[0].name }));
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
    setAnnouncement(t.starting);

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
      setAnnouncement(t.complete);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement(t.failed);
    }
  };

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') setAnnouncement(t.sharedSuccessfully);
    else if (result.status === 'canceled') setAnnouncement(t.sharingCanceled);
    else if (result.status === 'error') setAnnouncement(t.shareError);
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
            ? formatMessage(t.skippedOne, { name: rejectedFiles[0] })
            : formatMessage(t.skippedMany, { count: rejectedFiles.length })}
        </p>
      )}

      {/* Rendered whether or not a file is loaded yet: a visitor who has only
          seen the dropzone should see what the tool actually does before
          they commit to picking a file, not after. Picking a card here only
          sets `level` - it costs nothing without a file, and the choice
          carries over the moment one is dropped in. */}
      <div>
        <div class={styles['compress-options']} role="radiogroup" aria-label={t.compressionOptionsLabel}>
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
              {opt.id === 'medium' && <span class={styles['recommended-ribbon']}>{t.ourPick}</span>}
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
              {t.targetBadge}
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
                  {t.targetSizeLabel}
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
                <ProgressRing progress={progress} label={t.compressing} />
              ) : (
                t.compress
              )}
            </button>
          )
        ) : (
          <button type="button" class={pdfToolStyles['tool-primary-action']} disabled>
            {t.addPdfToCompress}
          </button>
        )}

        {hasFiles && status === 'error' && (
            <ErrorMessage title={t.compressionFailedTitle}>
              {t.compressionFailedBody}
            </ErrorMessage>
          )}

          {hasFiles && status === 'done' && downloadUrl && (
            <>
              <div class={styles['compression-stats']}>
                <p class={styles['stats-title']}>{t.successTitle}</p>
                <div class={styles['stats-grid']}>
                  <div class={styles['metric-item']}>
                    <span class={styles['metric-label']}>{t.originalSize}</span>
                    <span class={styles['metric-val']}>{formatBytes(file.size)}</span>
                  </div>
                  <div class={styles['metric-item']}>
                    <span class={styles['metric-label']}>{t.compressedSize}</span>
                    <span class={styles['metric-val']}>{formatBytes(compressedSize as number)}</span>
                  </div>
                  <div class={styles['metric-item']}>
                    <span class={styles['metric-label']}>{t.spaceSaved}</span>
                    <span class={styles['metric-saving']}>
                      {savingsPercent > 0 ? formatMessage(t.savedPercent, { percent: savingsPercent }) : t.noReduction}
                    </span>
                  </div>
                </div>
                {level === 'target' && !metTarget && (
                  <p class={styles['compress-warning']}>
                    {formatMessage(t.closestAchievable, { size: formatBytes(targetKB * 1024) })}
                  </p>
                )}
                <p class={styles['compress-warning']}>
                  {t.rasterizeNotice}
                </p>
              </div>

              <DownloadButton
                href={downloadUrl}
                download={file.name.replace(/\.pdf$/i, '') + '-compressed.pdf'}
                label={t.downloadLabel}
              />
              <PdfShareButton visible={shareReady} onShare={handleShare} label={t.shareLabel} />
            </>
          )}
      </div>

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
