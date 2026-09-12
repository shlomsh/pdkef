import { useRef, useState } from 'preact/hooks';
import { compressPdf, compressPdfToTarget } from '../lib/compress.js';
import { compressImageToTarget } from '../lib/compressImage.js';
import { useObjectUrls } from '../lib/useObjectUrls.js';
import BasePdfTool from './BasePdfTool.tsx';
import styles from './PdfCompressTool.module.css';
import pdfToolStyles from './PdfTool.module.css';
import PdfShareButton from './PdfShareButton.tsx';
import ProgressRing from './ProgressRing.tsx';
import ErrorMessage from './ErrorMessage.tsx';
import DownloadButton from './DownloadButton.tsx';
import CompareSlider from './CompareSlider.tsx';
import { usePdfShare } from '../lib/usePdfShare.js';
import { describeFile } from '../lib/format.js';
import type { AnalyticsTool } from '../lib/productAnalytics.ts';
import { englishCompressMessages, formatMessage, type CompressMessages, type ShellMessages } from '../i18n/toolMessages';

const TARGET_SIZE_PRESETS_KB = [100, 200, 500, 1024];
// Lower than the PDF presets above: the image half of this tool's demand is
// the photo half of application portals, which commonly cap a photo at
// 20-50KB, tighter than the document limits the PDF presets target.
const IMAGE_TARGET_SIZE_PRESETS_KB = [20, 50, 100, 200, 500];

function extensionOf(name: string) {
  const match = /\.([^./\\]+)$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}

/** Derives which half of the tool a file belongs to from its MIME type,
 * falling back to the filename extension only when the type is empty (some
 * drag sources hand over a File with no `type` at all). Returns null for
 * anything else, which both the accept-filter and the dispatch logic below
 * treat as "reject this file". */
function deriveKind(file: File | null): 'pdf' | 'image' | null {
  if (!file) return null;
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/jpeg' || file.type === 'image/png') return 'image';
  if (!file.type) {
    const ext = extensionOf(file.name);
    if (ext === 'pdf') return 'pdf';
    if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') return 'image';
  }
  return null;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// The PDF search re-encodes as JPEG-in-PDF and the image search re-encodes
// as JPEG (compressImageToTarget flattens PNG transparency to white), but a
// file already under the target passes through untouched in both cases, so
// a small PNG or an already-small PDF stays exactly what it was: name the
// download by the *output* blob's own type, never by the input's extension
// or by which half of the tool ran.
function deriveDownloadName(originalName: string, outputType: string) {
  const base = originalName.replace(/\.[^./\\]+$/, '') || 'file';
  const extension = outputType === 'application/pdf' ? 'pdf' : outputType === 'image/png' ? 'png' : 'jpg';
  return `${base}-compressed.${extension}`;
}

interface PdfCompressToolProps {
  /** LOC-02: server-rendered by src/pages/[locale]/[tool].astro for a
   * localized edition; every key not overridden keeps the English default. */
  messages?: Partial<CompressMessages>;
  shellMessages?: Partial<ShellMessages>;
  /** /compress/ stays 'compress'; /compress-image/ (the SEO door for
   * image-word queries, mounting this same island) passes 'compress-image'. */
  analyticsTool?: AnalyticsTool;
  /** What to show before any file is dropped: the PDF quality-level grid
   * ('levels', the default) or the image-style Target Size panel on its own
   * ('target', used by /compress-image/'s image-first drop hint). Once a
   * real file is loaded, `kind` (derived from the file itself) decides -
   * this only controls the pre-drop guess. */
  initialMode?: 'levels' | 'target';
  emptyStateMessage?: string;
}

export default function PdfCompressTool({
  messages: messagesProp,
  shellMessages,
  analyticsTool = 'compress',
  initialMode = 'levels',
  emptyStateMessage,
}: PdfCompressToolProps = {}) {
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
  const [outputType, setOutputType] = useState('');
  const [dimensions, setDimensions] = useState<{ width: number; height: number; originalWidth: number; originalHeight: number } | null>(null);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const { shareReady, prepareFiles, clearPrepared, sharePrepared } = usePdfShare();

  const kind = deriveKind(file);
  // Target Size is the only mode for an image - there's no quality-level
  // grid to show. Before any file is picked, `initialMode` stands in for
  // that same choice, so /compress-image/ can open straight into the
  // image-style panel instead of a PDF grid nobody there asked for.
  const isImageMode = kind === 'image' || (kind === null && initialMode === 'target');
  const targetSizePresets = isImageMode ? IMAGE_TARGET_SIZE_PRESETS_KB : TARGET_SIZE_PRESETS_KB;

  // Before/after preview (SEO-25, extended to images 2026-09-12) - see
  // handleToggleCompare below. The compressed Blob itself never needs to be
  // state - only its object URL (above) does, for the download link - but
  // the slider needs the raw bytes (to rasterize page 1 for a PDF, or to
  // build an object URL for an image), so it's kept in a ref rather than
  // duplicating it into render-triggering state.
  const compressedBlobRef = useRef<Blob | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [comparePreviews, setComparePreviews] = useState<{ before: string; after: string } | null>(null);
  const [compareStatus, setCompareStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  // True when compressImageToTarget's passthrough rule fired (the file was
  // already under target, so the "compressed" blob is literally the input
  // File) - see the toggle's render check below for why that hides it
  // rather than rendering it.
  const [imagePassthrough, setImagePassthrough] = useState(false);
  // Object URLs created for the image-mode comparison (see handleToggleCompare)
  // aren't run through `useObjectUrls` like `downloadUrl` is: that hook's own
  // `url` lands a render after `setBlob` is called, but both sides need to
  // land in `comparePreviews` together in the same tick so the render below
  // stays one branch shared with the PDF path. Tracked here purely so they
  // can be revoked the same way `useObjectUrls` revokes the download URL.
  const compareImageUrlsRef = useRef<{ before: string; after: string } | null>(null);

  const clearComparePreviews = () => {
    if (compareImageUrlsRef.current) {
      URL.revokeObjectURL(compareImageUrlsRef.current.before);
      URL.revokeObjectURL(compareImageUrlsRef.current.after);
      compareImageUrlsRef.current = null;
    }
    setComparePreviews(null);
  };

  const resetOutput = () => {
    clearPrepared();
    setStatus('idle');
    setProgress(0);
    setCompressedSize(null);
    setOutputType('');
    setDimensions(null);
    clearDownload();
    compressedBlobRef.current = null;
    setCompareOpen(false);
    clearComparePreviews();
    setCompareStatus('idle');
    setImagePassthrough(false);
  };

  // Builds the before/after pair for the CompareSlider. PDF: renders page 1
  // of the original and of the compressed result to data URLs via a
  // lazy-imported `renderComparePreview`. Image: no rasterization is
  // involved - the "before" is the original `file` and the "after" is the
  // output blob already sitting in `compressedBlobRef`, both already fully
  // decoded bytes on this device, so two object URLs are all that's needed
  // and there's nothing to await.
  //
  // One shared path for both ways the panel opens: automatically once a
  // result lands (see handleCompress) and via the "Hide comparison" /
  // "Compare with original" toggle below, which only flips `compareOpen`
  // and otherwise defers to this same function - see `handleToggleCompare`.
  // Both call sites guard on `comparePreviews` already being set, so
  // re-opening after a hide never re-renders.
  //
  // The panel now opens by default as soon as a result exists (Shlomi,
  // 2026-09-12: "it turned out amazing, it is however very hidden, keep it
  // open by default so it is visible before the user downloads" - see
  // backlog/tasks/SEO-25.md's "Open by default" section), so the lazy-import
  // here is what keeps it off the compress-result's critical path rather
  // than gating whether it renders at all. A measured cost still matters for
  // the PDF path, because a visitor who lands on this panel automatically
  // must not be left waiting or out of memory on a phone. Per the comment on
  // `renderComparePreview` (src/lib/thumbnails.js), each preview costs about
  // one page-render at roughly the same scale the compressor itself already
  // used for every page in the document that was just processed on this
  // device - so a device that could compress the whole document a moment ago
  // can afford two more page renders now. An emulated-low-end-mobile
  // Playwright run (e2e/compress/compare-preview.spec.js, 4x CPU throttling,
  // 390x844 viewport) measured this panel opening in well under a second;
  // see that spec for the recorded number, now timed from the "Successfully
  // Compressed" message to the slider's auto-open rather than from a tap.
  // The image path has no equivalent rasterization cost to measure - it's
  // two `URL.createObjectURL` calls on bytes already decoded a moment
  // earlier by the compressor itself.
  const openCompare = async () => {
    if (comparePreviews || compareStatus === 'loading' || !file || !compressedBlobRef.current) return;

    if (kind === 'image') {
      const before = URL.createObjectURL(file);
      const after = URL.createObjectURL(compressedBlobRef.current);
      compareImageUrlsRef.current = { before, after };
      setComparePreviews({ before, after });
      return;
    }

    setCompareStatus('loading');
    try {
      const { renderComparePreview } = await import('../lib/thumbnails.js');
      const [before, after] = await Promise.all([
        renderComparePreview(file),
        renderComparePreview(compressedBlobRef.current),
      ]);
      setComparePreviews({ before, after });
      setCompareStatus('idle');
    } catch (err) {
      console.error(err);
      setCompareStatus('error');
    }
  };

  const handleToggleCompare = () => {
    if (compareOpen) {
      setCompareOpen(false);
      return;
    }
    setCompareOpen(true);
    openCompare();
  };

  const handleFilesAdded = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    const accepted = incoming.filter((f) => deriveKind(f) !== null);
    const rejected = incoming.filter((f) => deriveKind(f) === null);

    setRejectedFiles(rejected.length > 0 ? rejected.map((f) => f.name) : []);

    if (accepted.length > 0) {
      const next = accepted[0];
      setFile(next);
      resetOutput();
      setAnnouncement(formatMessage(deriveKind(next) === 'image' ? t.imageLoaded : t.loaded, { name: next.name }));
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
    setAnnouncement(kind === 'image' ? t.imageStarting : t.starting);

    try {
      if (kind === 'image') {
        const result = await compressImageToTarget(file, {
          targetKB,
          onProgress: setProgress,
        });
        const resultType = result.blob.type || 'image/jpeg';

        setCompressedSize(result.blob.size);
        setMetTarget(result.metTarget);
        setOutputType(resultType);
        setDimensions({
          width: result.width,
          height: result.height,
          originalWidth: result.originalWidth,
          originalHeight: result.originalHeight,
        });
        // compressImageToTarget's passthrough rule returns the input File
        // itself as `blob` when it was already under target - reference
        // equality here is exactly that check, no size/byte comparison
        // needed. See the toggle's render check below for why that matters.
        setImagePassthrough(result.blob === file);
        compressedBlobRef.current = result.blob;
        setDownloadBlob(result.blob);
        prepareFiles([{ blob: result.blob, filename: deriveDownloadName(file.name, resultType), type: resultType }]);
        setStatus('done');
        setAnnouncement(result.metTarget ? t.imageComplete : t.missedTarget);
        // Open by default (SEO-25, 2026-09-12) - except a passthrough result,
        // which never gets a toggle at all (see the render check below).
        if (result.blob !== file) {
          setCompareOpen(true);
          openCompare();
        }
        return;
      }

      let compressedBlob: Blob;
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

      const resultType = compressedBlob.type || 'application/pdf';

      setCompressedSize(compressedBlob.size);
      setMetTarget(didMeetTarget);
      setOutputType(resultType);
      compressedBlobRef.current = compressedBlob;
      setDownloadBlob(compressedBlob);
      prepareFiles([{ blob: compressedBlob, filename: deriveDownloadName(file.name, resultType), type: resultType }]);
      setStatus('done');
      setAnnouncement(t.complete);
      // Open by default (SEO-25, 2026-09-12): see openCompare's comment.
      setCompareOpen(true);
      openCompare();
    } catch (err) {
      console.error(err);
      setStatus('error');
      setAnnouncement(kind === 'image' ? t.imageFailed : t.failed);
    }
  };

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') setAnnouncement(kind === 'image' ? t.imageSharedSuccessfully : t.sharedSuccessfully);
    else if (result.status === 'canceled') setAnnouncement(kind === 'image' ? t.imageSharingCanceled : t.sharingCanceled);
    else if (result.status === 'error') setAnnouncement(t.shareError);
  };

  const hasFiles = !!file;

  // Calculate savings percentage
  const savingsPercent = file && compressedSize
    ? Math.round((1 - compressedSize / file.size) * 100)
    : 0;

  const actionAndResults = (
    <>
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
              isImageMode ? t.compressImage : t.compress
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
          {kind === 'image' ? t.imageCompressionFailedBody : t.compressionFailedBody}
        </ErrorMessage>
      )}

      {hasFiles && status === 'done' && downloadUrl && (
        <>
          <div class={styles['compression-stats']}>
            <p class={styles['stats-title']}>{kind === 'image' ? t.imageSuccessTitle : t.successTitle}</p>
            <div class={styles['stats-grid']}>
              <div class={styles['metric-item']}>
                <span class={styles['metric-label']}>{t.originalSize}</span>
                <span class={styles['metric-val']}>{formatBytes(file!.size)}</span>
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
              {kind === 'image' && dimensions && (
                <>
                  <div class={styles['metric-item']}>
                    <span class={styles['metric-label']}>{t.originalDimensions}</span>
                    <span class={styles['metric-val']}>{dimensions.originalWidth} × {dimensions.originalHeight}</span>
                  </div>
                  <div class={styles['metric-item']}>
                    <span class={styles['metric-label']}>{t.outputDimensions}</span>
                    <span class={styles['metric-val']}>{dimensions.width} × {dimensions.height}</span>
                  </div>
                </>
              )}
            </div>

            {/* The honest-miss line: one shared block, worded per kind - a
                photo's target only ever comes from the image panel, a PDF's
                only from the Target Size card, so the two conditions never
                overlap. */}
            {!metTarget && (kind === 'image' || level === 'target') && (
              <p class={styles['compress-warning']}>
                {formatMessage(kind === 'image' ? t.imageClosestAchievable : t.closestAchievable, { size: formatBytes(targetKB * 1024) })}
              </p>
            )}

            <p class={styles['compress-warning']}>
              {kind === 'image' ? t.formatNotice : t.rasterizeNotice}
            </p>

            {/* Open by default as soon as a result exists (see openCompare
                and handleCompress) - a visitor sees whether the notice above
                is a dealbreaker for their file before they even reach the
                download button, instead of having to go looking for it. The
                toggle stays as a way to dismiss and re-open it. Shared by
                both halves of the tool: a PDF rasterizes page 1 on each
                side, an image just points at the original `file` and the
                output blob it already has. Hidden entirely for a passthrough
                image - the output *is* the input when it was already under
                target, so both sides of the slider would be the same bytes,
                which is noise rather than a comparison. */}
            {!(kind === 'image' && imagePassthrough) && (
              <>
                <button
                  type="button"
                  class={styles['compare-toggle-button']}
                  onClick={handleToggleCompare}
                  aria-expanded={compareOpen}
                >
                  {compareOpen ? 'Hide comparison' : 'Compare with original'}
                </button>

                {compareOpen && (
                  <div class={styles['compare-panel']}>
                    {compareStatus === 'loading' && (
                      <>
                        {/* The visible "still working" notification: async
                            and non-blocking (openCompare never gates the
                            download/share row above), but a visitor
                            shouldn't have to take that on faith - a pulsing
                            placeholder in the slider's own shape says so
                            without a spinner competing for attention. */}
                        <div class={styles['compare-skeleton']} aria-hidden="true" />
                        <p class={styles['compare-status']} aria-live="polite">Rendering page 1 for comparison…</p>
                      </>
                    )}
                    {compareStatus === 'error' && (
                      <p class={styles['compare-status']}>Couldn't render a preview for this file.</p>
                    )}
                    {comparePreviews && (
                      <>
                        <CompareSlider
                          beforeSrc={comparePreviews.before}
                          afterSrc={comparePreviews.after}
                          beforeLabel="Original"
                          afterLabel="Compressed"
                        />
                        <p class={styles['compare-caption']}>
                          {kind === 'image'
                            ? 'Drag to compare the original and the compressed image.'
                            : 'Drag to compare page 1. The rest of the document compresses the same way.'}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <DownloadButton
            href={downloadUrl}
            download={deriveDownloadName(file!.name, outputType)}
            label={kind === 'image' ? t.imageDownloadLabel : t.downloadLabel}
          />
          <PdfShareButton visible={shareReady} onShare={handleShare} label={kind === 'image' ? t.imageShareLabel : t.shareLabel} />
        </>
      )}
    </>
  );

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      analyticsTool={analyticsTool}
      analyticsStatus={status}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      accept="application/pdf,image/jpeg,image/png"
      emptyStateMessage={emptyStateMessage ?? t.dropHint}
      file={file}
      fileLabel={file?.name}
      fileMeta={describeFile(file)}
      hasWork={status === 'done'}
      workNoun={kind === 'image' ? t.imageWorkNoun : t.workNoun}
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

      {/* Rendered whether or not a file is loaded yet: a visitor who has only
          seen the dropzone should see what the tool actually does before
          they commit to picking a file, not after. Picking a card here only
          sets `level` - it costs nothing without a file, and the choice
          carries over the moment one is dropped in. Image mode replaces this
          whole grid with the standalone Target Size panel, since there is no
          quality-level choice to make for a photo. */}
      <div class={isImageMode ? styles['image-target-panel'] : undefined}>
        {isImageMode ? (
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
              {targetSizePresets.map((kb) => (
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
        ) : (
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
                    {targetSizePresets.map((kb) => (
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
        )}

        {actionAndResults}
      </div>

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
