import { useState } from 'preact/hooks';
import { compressImageToTarget } from '../lib/compressImage.js';
import { useObjectUrls } from '../lib/useObjectUrls.js';
import BasePdfTool from './BasePdfTool.tsx';
import styles from './PdfCompressTool.module.css';
import ownStyles from './PdfCompressImageTool.module.css';
import pdfToolStyles from './PdfTool.module.css';
import PdfShareButton from './PdfShareButton.tsx';
import ProgressRing from './ProgressRing.tsx';
import ErrorMessage from './ErrorMessage.tsx';
import DownloadButton from './DownloadButton.tsx';
import { usePdfShare } from '../lib/usePdfShare.js';
import { describeFile } from '../lib/format.js';
import { englishCompressImageMessages, formatMessage, type CompressImageMessages, type ShellMessages } from '../i18n/toolMessages';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];
// Lower than PdfCompressTool's own presets (100/200/500/1024): SEO-19's
// demand is the photo half of application portals, which commonly cap a
// photo at 20-50KB, tighter than the document limits PdfCompressTool targets.
const TARGET_SIZE_PRESETS_KB = [20, 50, 100, 200, 500];

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// The search re-encodes as JPEG (compressImageToTarget flattens PNG
// transparency to white), but a file already under the target passes
// through untouched, so a small PNG stays a PNG: name it by the blob's own
// type, not by the input's extension.
function deriveDownloadName(originalName: string, outputType: string) {
  const base = originalName.replace(/\.[^./\\]+$/, '');
  const extension = outputType === 'image/png' ? 'png' : 'jpg';
  return `${base || 'image'}-compressed.${extension}`;
}

interface PdfCompressImageToolProps {
  /** Every key not overridden keeps the English default - see
   * PdfCompressTool.tsx's identical prop for the localization contract this
   * mirrors. No localized edition exists yet (SEO-19 ships English first). */
  messages?: Partial<CompressImageMessages>;
  shellMessages?: Partial<ShellMessages>;
}

export default function PdfCompressImageTool({ messages: messagesProp, shellMessages }: PdfCompressImageToolProps = {}) {
  const t: CompressImageMessages = { ...englishCompressImageMessages, ...messagesProp };

  const [file, setFile] = useState<File | null>(null);
  const [targetKB, setTargetKB] = useState(100);
  const [status, setStatus] = useState('idle'); // idle | processing | done | error
  const [progress, setProgress] = useState(0);
  const { url: downloadUrl, setBlob: setDownloadBlob, clear: clearDownload } = useObjectUrls();
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [metTarget, setMetTarget] = useState(true);
  const [outputType, setOutputType] = useState('image/jpeg');
  const [dimensions, setDimensions] = useState<{ width: number; height: number; originalWidth: number; originalHeight: number } | null>(null);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const { shareReady, prepareFiles, clearPrepared, sharePrepared } = usePdfShare();

  const resetOutput = () => {
    clearPrepared();
    setStatus('idle');
    setProgress(0);
    setCompressedSize(null);
    setDimensions(null);
    clearDownload();
  };

  const handleFilesAdded = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    const images = incoming.filter((f) => ACCEPTED_TYPES.includes(f.type));
    const rejected = incoming.filter((f) => !ACCEPTED_TYPES.includes(f.type));

    setRejectedFiles(rejected.length > 0 ? rejected.map((f) => f.name) : []);

    if (images.length > 0) {
      setFile(images[0]);
      resetOutput();
      setAnnouncement(formatMessage(t.loaded, { name: images[0].name }));
    }
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
      const result = await compressImageToTarget(file, {
        targetKB,
        onProgress: setProgress,
      });

      setCompressedSize(result.blob.size);
      setMetTarget(result.metTarget);
      setOutputType(result.blob.type || 'image/jpeg');
      setDimensions({
        width: result.width,
        height: result.height,
        originalWidth: result.originalWidth,
        originalHeight: result.originalHeight,
      });
      setDownloadBlob(result.blob);
      prepareFiles([{ blob: result.blob, filename: deriveDownloadName(file.name, result.blob.type), type: result.blob.type || 'image/jpeg' }]);
      setStatus('done');
      setAnnouncement(result.metTarget ? t.complete : t.missedTarget);
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
  const savingsPercent = file && compressedSize
    ? Math.round((1 - compressedSize / file.size) * 100)
    : 0;

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      analyticsTool="compress-image"
      onFilesAdded={handleFilesAdded}
      multiple={false}
      accept="image/jpeg,image/png"
      emptyStateMessage="Drop image here"
      fileLabel={file?.name}
      fileMeta={describeFile(file)}
      hasWork={status === 'done'}
      workNoun={t.workNoun}
      shellMessages={shellMessages}
      compact
    >
      {rejectedFiles.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {rejectedFiles.length === 1
            ? formatMessage(t.skippedOne, { name: rejectedFiles[0] })
            : formatMessage(t.skippedMany, { count: rejectedFiles.length })}
        </p>
      )}

      {/* Rendered whether or not a photo is loaded yet, same reasoning as
          PdfCompressTool's own options: a visitor who has only seen the
          dropzone should see the target-size control before committing to a
          file, not after. Picking a preset here only sets `targetKB`. */}
      <div class={ownStyles.panel}>
        <div class={styles['target-size-panel']}>
          <label class={styles['target-size-label']} for="image-target-size-input">
            {t.targetSizeLabel}
          </label>
          <div class={styles['target-size-input-row']}>
            <input
              id="image-target-size-input"
              type="number"
              min="5"
              step="5"
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
            {t.addImageToCompress}
          </button>
        )}

        {hasFiles && status === 'error' && (
          <ErrorMessage title={t.compressionFailedTitle}>
            {t.compressionFailedBody}
          </ErrorMessage>
        )}

        {hasFiles && status === 'done' && downloadUrl && dimensions && (
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
                <div class={styles['metric-item']}>
                  <span class={styles['metric-label']}>{t.originalDimensions}</span>
                  <span class={styles['metric-val']}>{dimensions.originalWidth} × {dimensions.originalHeight}</span>
                </div>
                <div class={styles['metric-item']}>
                  <span class={styles['metric-label']}>{t.outputDimensions}</span>
                  <span class={styles['metric-val']}>{dimensions.width} × {dimensions.height}</span>
                </div>
              </div>
              {!metTarget && (
                <p class={styles['compress-warning']}>
                  {formatMessage(t.closestAchievable, { size: formatBytes(targetKB * 1024) })}
                </p>
              )}
              <p class={styles['compress-warning']}>
                {t.formatNotice}
              </p>
            </div>

            <DownloadButton
              href={downloadUrl}
              download={deriveDownloadName(file.name, outputType)}
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
