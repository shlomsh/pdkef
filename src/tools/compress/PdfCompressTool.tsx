import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { probeEncryption } from '../../lib/pdfEncryption.ts';
import { useLatestRun } from '../../lib/useLatestRun.ts';
import NeedsUnlock from '../../shell/NeedsUnlock.tsx';
import { compressPdf, compressPdfToTarget } from './compress.js';
import { compressImageToTarget } from './compressImage.js';
import { deriveFileKind } from '../../lib/fileKind.js';
import { useObjectUrls } from '../../lib/useObjectUrls.js';
import { useHandoffIntake } from '../../lib/useHandoffIntake.ts';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import CompressVerb from './verb/CompressVerb.tsx';
import styles from './PdfCompressTool.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import PdfShareButton from '../../shell/PdfShareButton.tsx';
import ProgressRing from '../../shell/ProgressRing.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import DownloadButton from '../../shell/DownloadButton.tsx';
import CompareSlider from './CompareSlider.tsx';
import LevelPicker, { TargetSizePanel, type Level } from './components/LevelPicker.tsx';
import CompressStrip from './components/CompressStrip.tsx';
import { createLatestOnly } from './latestOnly.ts';
import { comparePreviewWidth } from './compareSize.js';
import { usePdfShare } from '../../lib/usePdfShare.js';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { describeFile, isolateLtr, isolateName } from '../../lib/format.js';
import type { AnalyticsTool } from '../../lib/productAnalytics.ts';
import { englishCompressMessages, formatMessage, type CompressMessages, type ShellMessages } from '../../i18n/toolMessages';
import { getPdfLib } from '../../lib/pdfLib.js';
import { reportError } from '../../lib/errorReport.ts';
import { recordAction } from '../../lib/actionTrail.ts';

// Wording only: below this saving the result card says so plainly. The file is still offered (COMP-01).
const SLIGHT_GAIN_PERCENT = 5;

const TARGET_SIZE_PRESETS_KB = [100, 200, 500, 1024];
// Lower than the PDF presets above: the image half of this tool's demand is
// the photo half of application portals, which commonly cap a photo at
// 20-50KB, tighter than the document limits the PDF presets target. Four, so
// they fit one row beside the KB field: 500KB went (Shlomi, 2026-10-15), a PDF
// cap rather than a photo one; any size can still be typed.
const IMAGE_TARGET_SIZE_PRESETS_KB = [20, 50, 100, 200];

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

export function formatShare(share: number, lessThanOnePercent = englishCompressMessages.lessThanOnePercent): string {
  return share < 0.01 ? lessThanOnePercent : `${Math.round(share * 100)}%`;
}

export default function PdfCompressTool({
  messages: messagesProp,
  shellMessages,
  analyticsTool = 'compress',
  initialMode = 'levels',
  emptyStateMessage,
}: PdfCompressToolProps = {}) {
  const t: CompressMessages = { ...englishCompressMessages, ...messagesProp };
  // A size inside a catalogue string is bidi-isolated in right-to-left text.
  const sizeText = (bytes: number) => isolateLtr(formatBytes(bytes), t.dir);

  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<Level>('medium');
  const [targetKB, setTargetKB] = useState(100);
  const [status, setStatus] = useState('idle'); // idle | processing | done | error
  useHoldUpdate(status === 'processing');
  useHoldUpdate(file !== null, 'open');
  const [progress, setProgress] = useState(0);
  const { url: downloadUrl, setBlob: setDownloadBlob, clear: clearDownload } = useObjectUrls();
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [metTarget, setMetTarget] = useState(true);
  const [outputType, setOutputType] = useState('');
  const [dimensions, setDimensions] = useState<{ width: number; height: number; originalWidth: number; originalHeight: number } | null>(null);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  // ENC-08: the bytes of a PDF that needs a password. Set means the options and the Compress button give
  // way to NeedsUnlock (src/shell/NeedsUnlock.tsx); every new pick clears it before the check runs again.
  const [needsUnlockBytes, setNeedsUnlockBytes] = useState<ArrayBuffer | null>(null);
  const encryptionCheck = useLatestRun();
  // COMP-01: what the PDF is made of (images, text), read once it is added so the tool can say
  // before any click that there is nothing to shrink. Never gates anything else.
  const [analysis, setAnalysis] = useState<{ images: unknown[]; hasText: boolean; imageShare: number; pageCount: number } | null>(null);
  const analysisTokenRef = useRef(0);
  const [rasterBytes, setRasterBytes] = useState<number | null>(null);
  // COMP-01: by default only the images are recompressed and every page stays as it is; true turns
  // the pages into pictures (compress.js). Survives a new file, like the level.
  const [flatten, setFlatten] = useState(false);
  // Why the image-only path did what it did; null on the flatten path and before a result.
  const [imageReason, setImageReason] = useState<string | null>(null);
  // Bytes of images the image path left as they were (compressPdfImages' keptBytes).
  const [keptBytes, setKeptBytes] = useState(0);
  const [resultImageBytes, setResultImageBytes] = useState(0);
  const { shareReady, prepareFiles, clearPrepared, sharePrepared } = usePdfShare();
  // e2e reads this beside data-compress-status: it counts the runs that have started.
  const [runCount, setRunCount] = useState(0);
  // A run is requested by bumping this; the effect below starts it after the render that
  // carries the new file, level, target and switch, so the run always reads the latest.
  const [runRequest, setRunRequest] = useState(0);
  const handleCompressRef = useRef<() => Promise<void>>(async () => {});
  const runnerRef = useRef<{ request(): void } | null>(null);
  runnerRef.current ??= createLatestOnly(() => handleCompressRef.current());
  const targetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const kind = deriveFileKind(file);
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
  const [comparePreviews, setComparePreviews] = useState<{ before: string; after: string } | null>(null);
  const [compareStatus, setCompareStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  // Full screen view (COMP-01): a modal dialog holding the same slider at the
  // viewport's width. The PDF path re-renders both sides larger on first open
  // and caches them for the current result; the image path reuses the inline
  // object URLs, which are already full resolution.
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenPreviews, setFullscreenPreviews] = useState<{ before: string; after: string } | null>(null);
  const [fullscreenStatus, setFullscreenStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const fullscreenDialogRef = useRef<HTMLDialogElement | null>(null);
  // True when either compressor's passthrough rule fired (the file was
  // already under target, so the "compressed" blob is literally the input
  // File, both bytes and reference) - compressImageToTarget on the image
  // side, compressPdfToTarget on the PDF side (compressPdf with a level
  // never returns the input, it always re-encodes). See the toggle's render
  // check below for why that hides it rather than rendering it, and the
  // notice paragraph for why it replaces the re-encode warning with an
  // honest "untouched" one.
  const [passthrough, setPassthrough] = useState(false);
  // A PDF passthrough that is not the "already under target" kind: re-rendering
  // it would only have made it bigger, so the input is handed back as it is.
  // Everything that calls the result "compressed" (title, button, file name)
  // reads this instead.
  const [unchanged, setUnchanged] = useState(false);
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
    setFullscreenOpen(false);
    setFullscreenPreviews(null);
    setFullscreenStatus('idle');
  };

  // Bumped on every change that invalidates an in-flight run (new file,
  // level change, target size change) - resetOutput is the one place all of
  // those already go through. handleCompress and openCompare capture this
  // before their first await and check it after, so a run that outlives its
  // file (a drop or Replace mid-compress, since costsSomething is false
  // until status is 'done') lands nothing.
  const runTokenRef = useRef(0);

  const resetOutput = () => {
    runTokenRef.current += 1;
    clearPrepared();
    setStatus('idle');
    setProgress(0);
    setCompressedSize(null);
    setOutputType('');
    setDimensions(null);
    clearDownload();
    compressedBlobRef.current = null;
    clearComparePreviews();
    setCompareStatus('idle');
    setPassthrough(false);
    setUnchanged(false);
    setRasterBytes(null);
    setImageReason(null);
    setKeptBytes(0);
    setResultImageBytes(0);
  };

  // Builds the before/after pair for the CompareSlider. PDF: renders page 1
  // of the original and of the compressed result to data URLs via a
  // lazy-imported `renderComparePreview`. Image: no rasterization is
  // involved - the "before" is the original `file` and the "after" is the
  // output blob already sitting in `compressedBlobRef`, both already fully
  // decoded bytes on this device, so two object URLs are all that's needed
  // and there's nothing to await.
  //
  // The panel opens on its own as soon as a result exists (handleCompress);
  // it guards on `comparePreviews` so a repeat call never re-renders.
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

    const activeFile = file;
    const activeBlob = compressedBlobRef.current;

    if (kind === 'image') {
      const before = URL.createObjectURL(activeFile);
      const after = URL.createObjectURL(activeBlob);
      compareImageUrlsRef.current = { before, after };
      setComparePreviews({ before, after });
      return;
    }

    // Read before the await: if resetOutput runs while this is loading (a
    // drop, a Replace pick, or a level/target change), the run below is for
    // a file that's already gone - see runTokenRef's comment above.
    const runToken = runTokenRef.current;
    const width = comparePreviewWidth(window.innerWidth, window.devicePixelRatio || 1, 768);
    setCompareStatus('loading');
    try {
      const { renderComparePreview } = await import('../../lib/thumbnails.js');
      const [before, after] = await Promise.all([
        renderComparePreview(activeFile, width),
        renderComparePreview(activeBlob, width),
      ]);
      if (runToken !== runTokenRef.current) return;
      setComparePreviews({ before, after });
      setCompareStatus('idle');
    } catch (err) {
      if (runToken !== runTokenRef.current) return;
      reportError('pdf_render', err, 'render_compare_preview');
      console.error(err);
      setCompareStatus('error');
    }
  };

  const openFullscreen = async () => {
    if (!file || !compressedBlobRef.current) return;
    setFullscreenOpen(true);
    if (fullscreenPreviews || fullscreenStatus === 'loading') return;
    if (kind === 'image') {
      if (comparePreviews) setFullscreenPreviews(comparePreviews);
      return;
    }
    const activeFile = file;
    const activeBlob = compressedBlobRef.current;
    const runToken = runTokenRef.current;
    const width = comparePreviewWidth(window.innerWidth, window.devicePixelRatio || 1, window.innerWidth);
    setFullscreenStatus('loading');
    try {
      const { renderComparePreview } = await import('../../lib/thumbnails.js');
      const [before, after] = await Promise.all([
        renderComparePreview(activeFile, width),
        renderComparePreview(activeBlob, width),
      ]);
      if (runToken !== runTokenRef.current) return;
      setFullscreenPreviews({ before, after });
      setFullscreenStatus('idle');
    } catch (err) {
      if (runToken !== runTokenRef.current) return;
      reportError('pdf_render', err, 'render_compare_preview');
      console.error(err);
      setFullscreenStatus('error');
    }
  };

  // showModal() puts the dialog in the top layer, so it shows over a real
  // fullscreen element (a plain `open` attribute would not). jsdom has no
  // dialog implementation, hence the fallbacks (same as ConfirmDialog).
  useEffect(() => {
    const dialog = fullscreenDialogRef.current;
    if (!dialog || !fullscreenOpen || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.open = true;
  }, [fullscreenOpen]);

  const closeFullscreen = () => {
    const dialog = fullscreenDialogRef.current;
    if (dialog?.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.open = false;
    }
    setFullscreenOpen(false);
  };

  const handleFilesAdded = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    const accepted = incoming.filter((f) => deriveFileKind(f) !== null);
    const rejected = incoming.filter((f) => deriveFileKind(f) === null);

    setRejectedFiles(rejected.length > 0 ? rejected.map((f) => f.name) : []);

    if (accepted.length > 0) {
      const next = accepted[0];
      cancelTargetTimer();
      setFile(next);
      resetOutput();
      setAnnouncement(formatMessage(deriveFileKind(next) === 'image' ? t.imageLoaded : t.loaded, { name: next.name }));
      recordAction('add_files');
      setNeedsUnlockBytes(null);
      encryptionCheck.invalidate();
      analysisTokenRef.current += 1;
      setAnalysis(null);
      if (deriveFileKind(next) === 'pdf') {
        void checkEncryption(next);
        void analyze(next);
      } else {
        requestRun();
      }
    }
  };

  // Reads the PDF's make-up for the "nothing to shrink" note. A newer file wins: a stale result is dropped.
  const analyze = async (pdf: File) => {
    const token = analysisTokenRef.current;
    await analyzeInner(pdf, token);
  };

  const analyzeInner = async (pdf: File, token: number) => {
    let doc;
    let totalBytes = 0;
    try {
      const bytes = await pdf.arrayBuffer();
      const { PDFDocument } = await getPdfLib();
      totalBytes = bytes.byteLength;
      doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      if (doc.isEncrypted) {
        // A restricted PDF opens with an empty password; read it that way so text detection sees plaintext, not ciphertext.
        try {
          doc = await PDFDocument.load(bytes, { password: '', updateMetadata: false });
        } catch {
          // expected: a file that needs a real password is the person's file; keep the first read
        }
      }
    } catch {
      // expected: a PDF pdf-lib can't parse just gets no analysis note
      return;
    }
    try {
      // Dynamic: analyzePdf.js pulls in pdf-lib, which must not ride in the first download (DEBT-20).
      const { analyzePdf } = await import('./analyzePdf.js');
      const result = analyzePdf(doc, { totalBytes });
      if (token === analysisTokenRef.current) setAnalysis(result);
    } catch (err) {
      reportError('pdf_tool_run', err, 'analyze_pdf');
    }
  };

  // A password-protected PDF is a precondition, not a failure: it is parked for Unlock instead of failing
  // later with generic copy (a small one would even come back untouched as "compressed"). Only
  // 'needs-password' is gated; an owner-password-only file compresses correctly. A newer pick wins.
  const checkEncryption = async (pdf: File) => {
    const run = encryptionCheck.begin();
    try {
      const bytes = await pdf.arrayBuffer();
      const protection = await probeEncryption(bytes);
      if (!run.isCurrent()) return;
      run.settle();
      if (protection !== 'needs-password') {
        requestRun();
        return;
      }
      setNeedsUnlockBytes(bytes);
      setAnnouncement(t.protectedNeedsPasswordTitle);
    } catch (err) {
      console.error(err);
      if (!run.isCurrent()) return;
      run.settle();
      reportError('pdf_tool_run', err, 'check_encryption');
      requestRun();
    }
  };

  // MERGE-14: a merged PDF handed off from /merge/ (saveHandoff + navigate)
  // is collected here on mount and dropped straight into the same path a
  // manual pick takes. This tool has no draft to race against, so mount is
  // enough - see useHandoffIntake.ts's own comment for why Sign/Redact
  // instead resolve their hand-off ahead of a draft restore.
  useHandoffIntake('compress', (file) => handleFilesAdded([file]));

  // Shows the busy state at once, then asks for a run once the state it reads has rendered.
  const requestRun = () => {
    setStatus('processing');
    setRunRequest((n) => n + 1);
  };

  const cancelTargetTimer = () => {
    if (targetTimerRef.current !== null) clearTimeout(targetTimerRef.current);
    targetTimerRef.current = null;
  };

  useEffect(() => {
    if (runRequest > 0) runnerRef.current?.request();
  }, [runRequest]);

  useEffect(() => cancelTargetTimer, []);

  const handleLevelChange = (nextLevel: Level) => {
    if (nextLevel === level) return;
    cancelTargetTimer();
    setLevel(nextLevel);
    resetOutput();
    recordAction('change_setting');
    requestRun();
  };

  const handleFlattenChange = (next: boolean) => {
    cancelTargetTimer();
    setFlatten(next);
    resetOutput();
    recordAction('change_setting');
    requestRun();
  };

  // A preset runs at once; typing waits for a pause (500ms) so each keystroke is not a run.
  const handleTargetKBChange = (nextTargetKB: number, { immediate }: { immediate: boolean }) => {
    cancelTargetTimer();
    setTargetKB(Number.isFinite(nextTargetKB) && nextTargetKB > 0 ? nextTargetKB : 1);
    resetOutput();
    recordAction('change_setting');
    if (immediate) {
      requestRun();
      return;
    }
    setStatus('processing');
    targetTimerRef.current = setTimeout(() => {
      targetTimerRef.current = null;
      requestRun();
    }, 500);
  };

  const handleCompress = async () => {
    if (!file) return;
    // The file this run belongs to, and the token that marks it current -
    // both read before the first await, since a workspace drop or a Replace
    // pick can swap `file` out from under an in-flight compress (see
    // runTokenRef's comment above: costsSomething is false until status is
    // 'done', so neither is confirmed first).
    const activeFile = file;
    const runToken = runTokenRef.current;
    recordAction('export');
    setRunCount((n) => n + 1);
    setStatus('processing');
    setProgress(0);
    setAnnouncement(kind === 'image' ? t.imageStarting : t.starting);

    try {
      if (kind === 'image') {
        const result = await compressImageToTarget(activeFile, {
          targetKB,
          onProgress: setProgress,
        });
        if (runToken !== runTokenRef.current) return;
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
        setPassthrough(result.blob === activeFile);
        compressedBlobRef.current = result.blob;
        // A passthrough has nothing to download: the output is the input.
        if (result.blob !== activeFile) {
          setDownloadBlob(result.blob);
          prepareFiles([{ blob: result.blob, filename: deriveDownloadName(activeFile.name, resultType), type: resultType }]);
        }
        setStatus('done');
        setAnnouncement(result.metTarget ? t.imageComplete : t.missedTarget);
        // Open by default (SEO-25, 2026-09-12) - except a passthrough result,
        // which never gets a toggle at all (see the render check below).
        if (result.blob !== activeFile) {
          openCompare();
        }
        return;
      }

      if (!flatten) {
        const { compressPdfImages, compressPdfImagesToTarget, IMAGE_LEVELS } = await import('./compressImages.js');
        const result: { blob: Blob; metTarget?: boolean; reason: string; keptBytes?: number; imageBytes?: number } = level === 'target'
          ? await compressPdfImagesToTarget(activeFile, { targetKB, onProgress: setProgress })
          : await compressPdfImages(activeFile, { ...IMAGE_LEVELS[level as 'high' | 'medium' | 'low'], onProgress: setProgress });
        if (runToken !== runTokenRef.current) return;
        const imageBlob = result.blob;
        const resultType = imageBlob.type || 'application/pdf';
        const isPassthrough = imageBlob === activeFile;
        const isUnchanged = isPassthrough && result.reason !== 'under-target';
        setCompressedSize(imageBlob.size);
        setRasterBytes(null);
        setMetTarget(result.metTarget ?? true);
        setImageReason(result.reason);
        setKeptBytes(result.keptBytes ?? 0);
        setResultImageBytes(result.imageBytes ?? 0);
        setOutputType(resultType);
        setPassthrough(isPassthrough);
        setUnchanged(isUnchanged);
        compressedBlobRef.current = imageBlob;
        if (!isPassthrough) {
          setDownloadBlob(imageBlob);
          prepareFiles([{ blob: imageBlob, filename: deriveDownloadName(activeFile.name, resultType), type: resultType }]);
        }
        setStatus('done');
        setAnnouncement(
          result.reason === 'encrypted' ? t.lockedTitle
            : result.reason === 'unsupported' ? t.unsupportedTitle
              : isUnchanged ? t.alreadySmallComplete : t.complete,
        );
        if (!isPassthrough) {
          openCompare();
        }
        return;
      }

      let compressedBlob: Blob;
      let didMeetTarget = true;
      let resultRasterBytes: number | null = null;

      if (level === 'target') {
        const result = await compressPdfToTarget(activeFile, {
          targetKB,
          onProgress: setProgress,
        });
        compressedBlob = result.blob;
        didMeetTarget = result.metTarget;
        resultRasterBytes = result.rasterBytes;
      } else {
        const result = await compressPdf(activeFile, {
          level,
          onProgress: setProgress,
        });
        compressedBlob = result.blob;
        resultRasterBytes = result.rasterBytes;
      }

      if (runToken !== runTokenRef.current) return;

      const resultType = compressedBlob.type || 'application/pdf';

      setCompressedSize(compressedBlob.size);
      setRasterBytes(resultRasterBytes);
      setMetTarget(didMeetTarget);
      setOutputType(resultType);
      // compressPdfToTarget's passthrough rule returns the input File itself
      // as `blob` when it was already under target, the same reference-
      // equality check as the image branch above - compressPdf with a level
      // never returns the input, it always re-encodes, so this is only ever
      // true via the target path.
      const isPassthrough = compressedBlob === activeFile;
      // Under target is the only passthrough that is a success; every other
      // one (a level, or a target the input is still over) means the input
      // was already as small as it gets.
      const isUnchanged = isPassthrough && (level !== 'target' || !didMeetTarget);
      setPassthrough(isPassthrough);
      setUnchanged(isUnchanged);
      compressedBlobRef.current = compressedBlob;
      if (!isPassthrough) {
        setDownloadBlob(compressedBlob);
        prepareFiles([{ blob: compressedBlob, filename: deriveDownloadName(activeFile.name, resultType), type: resultType }]);
      }
      setStatus('done');
      setAnnouncement(isUnchanged ? t.alreadySmallComplete : t.complete);
      // Open by default (SEO-25, 2026-09-12): see openCompare's comment.
      // Except a passthrough result, same as the image branch above - both
      // sides of the slider would be the same bytes.
      if (compressedBlob !== activeFile) {
        openCompare();
      }
    } catch (err) {
      reportError('pdf_tool_run', err, 'compress');
      console.error(err);
      if (runToken !== runTokenRef.current) return;
      setStatus('error');
      setAnnouncement(kind === 'image' ? t.imageFailed : t.failed);
    }
  };

  handleCompressRef.current = handleCompress;

  const handleShare = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') recordAction('share');
    if (result.status === 'shared') setAnnouncement(kind === 'image' ? t.imageSharedSuccessfully : t.sharedSuccessfully);
    else if (result.status === 'canceled') setAnnouncement(kind === 'image' ? t.imageSharingCanceled : t.sharingCanceled);
    else if (result.status === 'error') setAnnouncement(t.shareError);
  };

  const hasFiles = !!file;

  // Calculate savings percentage
  const savingsPercent = file && compressedSize
    ? Math.round((1 - compressedSize / file.size) * 100)
    : 0;

  // The honest-miss condition (see the notice below) also decides what the
  // Download button's second line says - "closest achievable" rather than a
  // savings percentage that would misrepresent a target that wasn't hit.
  const missedTargetSize = !unchanged && !metTarget && (kind === 'image' || level === 'target');

  // Button anchor (SEO-25, 2026-09-12): a visitor's first read of the result
  // is now this line, inside the button they just pressed, rather than a
  // separate stats card they have to scroll to - see openCompare's comment
  // for why the card itself moved below the button. compressedSize is only
  // ever set alongside status 'done', so this stays undefined otherwise.
  // t.downloadDetailSmaller/t.downloadDetailClosest are their own short
  // messages, deliberately separate from t.closestAchievable (a full
  // sentence meant for the notice paragraph below, not a button's second
  // line).
  const downloadDetail = compressedSize == null
    ? undefined
    : missedTargetSize
      ? formatMessage(t.downloadDetailClosest, { size: sizeText(compressedSize) })
      : savingsPercent > 0 && !unchanged
        ? formatMessage(t.downloadDetailSmaller, { size: sizeText(compressedSize), percent: savingsPercent })
        : formatBytes(compressedSize);

  const unchangedNotice = unchanged && file
    ? formatMessage(level === 'target' ? t.alreadySmallTargetNotice : t.alreadySmallNotice, {
        raster: sizeText(rasterBytes ?? 0),
        original: sizeText(file.size),
        target: sizeText(targetKB * 1024),
      })
    : '';

  const slightGain = kind === 'pdf' && !passthrough && level !== 'target' && compressedSize != null
    && file != null && compressedSize < file.size && savingsPercent < SLIGHT_GAIN_PERCENT;
  let slightGainNotice = '';
  if (slightGain && imageReason === 'smaller') {
    const saving = savingsPercent >= 1 ? `${savingsPercent}%` : t.lessThanOnePercent;
    if (keptBytes > resultImageBytes / 2) {
      slightGainNotice = formatMessage(t.slightGainKeptNotice, { saving });
    } else {
      slightGainNotice = formatMessage(t.slightGainCompactNotice, { saving })
        + (level !== 'high' ? ` ${t.slightGainExtremeHint}` : '');
    }
  }

  const imageNotices = {
    'no-images': t.imagesNoImagesNotice,
    'no-gain': t.imagesNoGainNotice,
    encrypted: t.imagesEncryptedNotice,
    unsupported: t.imagesUnsupportedNotice,
    'under-target': t.passthroughNotice,
  };

  const resultNotice = imageReason === 'smaller'
    ? slightGainNotice
    : imageReason !== null
      ? imageNotices[imageReason as keyof typeof imageNotices]
      : unchanged ? unchangedNotice : passthrough ? t.passthroughNotice : kind === 'image' ? t.formatNotice : t.rasterizeNotice;

  const isDone = hasFiles && status === 'done';
  const isProcessing = hasFiles && status === 'processing';
  const showCompare = isDone && !passthrough;
  const hasSheet = isProcessing || (isDone && !passthrough && !!downloadUrl);
  const compareCaption = kind === 'image' ? t.compareCaptionImage : analysis?.pageCount === 1 ? t.compareCaptionPdfSingle : t.compareCaptionPdf;

  // The non-success headline of a finished run. A success has none: the strip carries the sizes.
  const resultTitle = !isDone ? ''
    : imageReason === 'encrypted' ? t.lockedTitle
      : imageReason === 'unsupported' ? t.unsupportedTitle
        : unchanged ? t.alreadySmallTitle
          : passthrough ? (kind === 'image' ? t.imageUnderTargetTitle : t.underTargetTitle)
            : slightGain ? t.slightGainTitle : '';

  // What the strip's note line says about the PDF; the strip reserves its height whatever arrives.
  let stripNote: ComponentChildren = null;
  if (kind === 'pdf' && analysis) {
    if (analysis.images.length === 0) stripNote = <strong>{t.noImagesTitle}</strong>;
    else if (!flatten) {
      stripNote = formatMessage(analysis.imageShare < 0.2 ? t.stripShareLowNote : t.stripShareNote, {
        share: formatShare(analysis.imageShare, t.lessThanOnePercent),
      });
    }
  }

  // The pages-to-pictures switch is for a PDF the image path could not shrink; until then it stays out of the way.
  const imagePathFellShort = isDone && (
    imageReason === 'unsupported' || imageReason === 'no-gain' || slightGain || (level === 'target' && !metTarget)
  );
  const showFlatten = kind === 'pdf' && (flatten || imagePathFellShort);

  const arrow = t.dir === 'rtl' ? '←' : '→';

  const fullscreenDialog = fullscreenOpen && (
    <dialog
      ref={fullscreenDialogRef}
      class={styles['compare-fullscreen']}
      aria-label={t.compareFullscreenLabel}
      onClose={() => setFullscreenOpen(false)}
    >
      <div class={styles['compare-fullscreen-header']}>
        <p class={styles['compare-caption']}>{compareCaption}</p>
        <button type="button" class={styles['compare-toggle-button']} onClick={closeFullscreen}>
          {t.compareCloseLabel}
        </button>
      </div>
      <div class={styles['compare-fullscreen-body']}>
        {fullscreenStatus === 'loading' && (
          <>
            <div class={styles['compare-skeleton']} aria-hidden="true" />
            <p class={styles['compare-status']} aria-live="polite">{t.compareRendering}</p>
          </>
        )}
        {fullscreenStatus === 'error' && <p class={styles['compare-status']}>{t.compareRenderFailed}</p>}
        {fullscreenPreviews && (
          <CompareSlider
            fill
            beforeSrc={fullscreenPreviews.before}
            afterSrc={fullscreenPreviews.after}
            beforeLabel={t.compareBeforeLabel}
            afterLabel={t.compareAfterLabel}
          />
        )}
      </div>
    </dialog>
  );

  const resultSection = (
    <section class={styles.result}>
      {hasFiles && status !== 'done' && status !== 'error' && (
        <div class={styles['compare-skeleton']} aria-hidden={isProcessing ? undefined : 'true'}>
          {isProcessing && (
            <div class={styles['skeleton-ring']}>
              <ProgressRing progress={progress} label={t.compressing} />
            </div>
          )}
        </div>
      )}

      {hasFiles && status === 'error' && (
        <ErrorMessage title={t.compressionFailedTitle}>
          {kind === 'image' ? t.imageCompressionFailedBody : t.compressionFailedBody}
        </ErrorMessage>
      )}

      {isDone && resultTitle && <p class={styles['stats-title']}>{resultTitle}</p>}

      {showCompare && (
        <div class={styles['compare-panel']}>
          {compareStatus === 'loading' && (
            <>
              {/* The visible "still working" placeholder in the slider's own shape; it never holds up Download. */}
              <div class={styles['compare-skeleton']} aria-hidden="true" />
              <p class={styles['compare-status']} aria-live="polite">{t.compareRendering}</p>
            </>
          )}
          {compareStatus === 'error' && <p class={styles['compare-status']}>{t.compareRenderFailed}</p>}
          {comparePreviews && (
            <>
              <CompareSlider
                beforeSrc={comparePreviews.before}
                afterSrc={comparePreviews.after}
                beforeLabel={t.compareBeforeLabel}
                afterLabel={t.compareAfterLabel}
              />
              <p class={styles['compare-caption']}>{compareCaption}</p>
              <button type="button" class={styles['compare-toggle-button']} onClick={openFullscreen}>
                {t.compareFullscreenLabel}
              </button>
            </>
          )}
        </div>
      )}
      {showCompare && fullscreenDialog}

      {showCompare && kind === 'image' && dimensions && (
        <p class={styles['dimension-line']}>
          <bdi>{dimensions.originalWidth} × {dimensions.originalHeight}</bdi> {arrow} <bdi>{dimensions.width} × {dimensions.height}</bdi>
        </p>
      )}

      {isDone && passthrough && (
        <div class={styles['stats-grid']}>
          <div class={styles['metric-item']}>
            <span class={styles['metric-label']}>{t.originalSize}</span>
            <span class={styles['metric-val']}>{formatBytes(file!.size)}</span>
          </div>
          {rasterBytes != null && (
            <div class={styles['metric-item']}>
              <span class={styles['metric-label']}>{t.asImagesSize}</span>
              <span class={styles['metric-val']}>{formatBytes(rasterBytes)}</span>
            </div>
          )}
          {unchanged && (
            <div class={styles['metric-item']}>
              <span class={styles['metric-label']}>{t.spaceSaved}</span>
              <span class={styles['metric-saving']}>{savingsPercent > 0 ? formatMessage(t.savedPercent, { percent: savingsPercent }) : t.keptOriginal}</span>
            </div>
          )}
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
      )}

      {/* The honest-miss line: worded per kind - a photo's target only ever comes from the image panel, a PDF's
          only from Exact size, so the two conditions never overlap. */}
      {isDone && imageReason === null && !unchanged && !metTarget && (kind === 'image' || level === 'target') && (
        <p class={styles['compress-warning']}>
          {formatMessage(kind === 'image' ? t.imageClosestAchievable : t.closestAchievable, { size: sizeText(targetKB * 1024) })}
        </p>
      )}
      {isDone && resultNotice && <p class={styles[passthrough ? 'honest-note' : 'compress-warning']}>{resultNotice}</p>}
      {isDone && imageReason === 'smaller' && level === 'target' && !metTarget && (
        <p class={styles['compress-warning']}>
          {formatMessage(t.imagesTargetMissedNotice, { size: sizeText(compressedSize as number), target: sizeText(targetKB * 1024) })}
        </p>
      )}
    </section>
  );

  const sheet = (
    <div class={`${styles['result-action']}${hasSheet ? ` ${styles['result-sheet']}` : ''}`} hidden={!hasSheet}>
      {isProcessing ? (
        <button type="button" class={`${pdfToolStyles['tool-primary-action']} ${pdfToolStyles['is-processing']}`} disabled>
          <ProgressRing progress={progress} label={t.compressing} />
        </button>
      ) : isDone && !passthrough && downloadUrl ? (
        <>
          <DownloadButton
            autoFocus={false}
            href={downloadUrl}
            download={deriveDownloadName(file!.name, outputType)}
            label={kind === 'image' ? t.imageDownloadLabel : t.downloadLabel}
            detail={downloadDetail}
            onClick={() => recordAction('download')}
          />
          <PdfShareButton visible={shareReady} onShare={handleShare} label={kind === 'image' ? t.imageShareLabel : t.shareLabel} />
        </>
      ) : null}
    </div>
  );

  return (
    <BasePdfTool
      emptyArt={<CompressVerb subject={analyticsTool === 'compress-image' ? 'photo' : 'page'} />}
      hasFiles={hasFiles}
      analyticsTool={analyticsTool}
      analyticsStatus={status}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      accept="application/pdf,image/jpeg,image/png"
      emptyStateMessage={emptyStateMessage ?? t.dropHint}
      file={file}
      fileLabel={file?.name}
      fileMeta={describeFile(file, undefined, undefined, shellMessages)}
      shellMessages={shellMessages}
      compact
      hideIdentity
    >
      {rejectedFiles.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {rejectedFiles.length === 1
            ? formatMessage(t.skippedOne, { name: isolateName(rejectedFiles[0], t.dir) })
            : formatMessage(t.skippedMany, { count: rejectedFiles.length })}
        </p>
      )}

      {needsUnlockBytes ? (
        <NeedsUnlock
          kind="needs-password"
          file={file}
          bytes={needsUnlockBytes}
          from="compress"
          toolName="Compress"
          verb="compress"
          messages={{
            title: t.protectedNeedsPasswordTitle,
            body: t.protectedNeedsPasswordBody,
            unlockIt: t.protectedUnlockIt,
            handoffFailed: t.protectedHandoffFailed,
          }}
        />
      ) : hasFiles && file ? (
        <div class={styles['loaded-layout']} data-compress-status={status} data-compress-run={runCount}>
          <CompressStrip
            file={file}
            dir={t.dir}
            originalLabel={formatBytes(file.size)}
            resultLabel={isDone && !passthrough && compressedSize != null ? formatBytes(compressedSize) : null}
            processing={isProcessing}
            processingLabel={t.compressing}
            savedLabel={isDone && !passthrough && savingsPercent > 0 ? formatMessage(t.percentSmaller, { percent: savingsPercent }) : null}
            note={stripNote}
          />

          <div class={styles.controls}>
            {isImageMode ? (
              <TargetSizePanel
                t={t}
                targetKB={targetKB}
                presets={targetSizePresets}
                onChange={handleTargetKBChange}
                inputId="image-target-size-input"
                min={5}
                step={5}
              />
            ) : (
              <LevelPicker
                value={level}
                onChange={handleLevelChange}
                t={t}
                targetKB={targetKB}
                onTargetKBChange={handleTargetKBChange}
                presets={targetSizePresets}
              />
            )}
            {showFlatten && (
              <label class={styles['flatten-switch']}>
                <input type="checkbox" checked={flatten} onChange={(e) => handleFlattenChange(e.currentTarget.checked)} />
                <span><strong>{t.flattenLabel}</strong> {analysis?.hasText !== false ? t.flattenHint : t.flattenHintNoText}</span>
              </label>
            )}
          </div>

          {resultSection}
          {sheet}
        </div>
      ) : null}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
