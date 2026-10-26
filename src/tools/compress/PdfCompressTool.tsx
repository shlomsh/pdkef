import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { createQuietPreparer, type QuietPolicy } from '../../lib/quietPrepare.ts';
import { probeEncryption } from '../../lib/pdfEncryption.ts';
import { useLatestRun } from '../../lib/useLatestRun.ts';
import NeedsUnlock from '../../shell/NeedsUnlock.tsx';
import { compressPdf, compressPdfToTarget } from './compress.js';
import { compressImageToTarget } from './compressImage.js';
import { deriveFileKind } from '../../lib/fileKind.js';
import { useObjectUrls } from '../../lib/useObjectUrls.js';
import { useHandoffIntake } from '../../lib/useHandoffIntake.ts';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import ToolShell, { FileActions } from '../../shell/ToolShell.tsx';
import CompressVerb from './verb/CompressVerb.tsx';
import styles from './PdfCompressTool.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import PdfShareButton from '../../shell/PdfShareButton.tsx';
import ProgressRing from '../../shell/ProgressRing.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import DownloadButton from '../../shell/DownloadButton.tsx';
import CompareSlider from './CompareSlider.tsx';
import LevelPicker, { TargetSizePanel, type Level } from './components/LevelPicker.tsx';
import { comparePreviewWidth } from './compareSize.js';
import { usePdfShare } from '../../lib/usePdfShare.js';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { isolateLtr, isolateName } from '../../lib/format.js';
import type { AnalyticsTool } from '../../lib/productAnalytics.ts';
import { englishCompressMessages, type CompressMessages, type ShellMessages } from '../../i18n/toolMessages';
import { formatMessage } from '../../lib/formatMessage';
import { getPdfLib } from '../../lib/pdfLib.js';
import { reportError } from '../../lib/errorReport.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import { reportEdit } from '../../lib/productAnalytics.ts';

// Wording only: below this saving the result says so plainly. The file is still offered (COMP-01).
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
  /** LOC-02: server-rendered by its src/pages/[locale]/<tool>.astro route for a
   * localized edition; every key not overridden keeps the English default. */
  messages?: Partial<CompressMessages>;
  shellMessages?: Partial<ShellMessages>;
  /** /compress/ stays 'compress'; /compress-image/ (the SEO door for
   * image-word queries, mounting this same island) passes 'compress-image'. */
  analyticsTool?: AnalyticsTool;
  emptyStateMessage?: string;
  /** Test-only: a short quiet-time policy so tests that are not about timing do not wait in real time. */
  quietPolicy?: QuietPolicy;
}

/** The state a build depends on; the quiet-time preparer caches and supersedes by it. */
const buildKey = (level: string, targetKB: number, flatten: boolean) => `${level}|${targetKB}|${flatten}`;

// Resolves with `url` once the browser has decoded it, so the <img> showing it has its height on the
// first frame it paints. Painted earlier, the centred in-flight panel was its label row alone and
// jumped 142px when the photo decoded (DEBT-56). The skeleton holds the place until then.
const decoded = (url: string) => {
  const img = new Image();
  img.src = url;
  // expected: a decode failure is the <img>'s to show; waiting longer would not help it
  return (img.decode ? img.decode() : Promise.resolve()).then(() => url, () => url);
};

/** Thrown inside a build that was superseded; its result is dropped, never reported. */
class StaleRun extends Error {}

/** Everything a finished build hands the island, so a cached one lands exactly as a fresh one. */
interface Built {
  blob: Blob;
  filename: string;
  outputType: string;
  metTarget: boolean;
  passthrough: boolean;
  unchanged: boolean;
  rasterBytes: number | null;
  imageReason: string | null;
  keptBytes: number;
  resultImageBytes: number;
  dimensions: { width: number; height: number; originalWidth: number; originalHeight: number } | null;
  announcement: string;
}

export function formatShare(share: number, lessThanOnePercent = englishCompressMessages.lessThanOnePercent): string {
  return share < 0.01 ? lessThanOnePercent : `${Math.round(share * 100)}%`;
}

export default function PdfCompressTool({
  messages: messagesProp,
  shellMessages,
  analyticsTool = 'compress',
  emptyStateMessage,
  quietPolicy,
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
  // ENC-08: the bytes of a PDF that needs a password. Set means the level picker and the result give
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
  // e2e reads this beside data-compress-status: it counts the builds that have started.
  const [runCount, setRunCount] = useState(0);
  // The key of the options a finished result was built for; it equals the current key when the result is fresh.
  const [resultKey, setResultKey] = useState<string | null>(null);
  // True only after a tap on Download or Share before the build is done: the one moment the compressing look shows.
  const [tapped, setTapped] = useState(false);
  // DEBT-59 analytics: the person's Download, Share or Retry is the start; the quiet-time builds after an
  // option change are not counted (the model Merge and Split use). 'done' once that tap's result is delivered.
  const [tap, setTap] = useState<'idle' | 'processing' | 'done'>('idle');
  // Quiet-time preparer (src/lib/quietPrepare.ts), one per opened file so a new file starts with an empty cache.
  const preparerRef = useRef<ReturnType<typeof createQuietPreparer<Built>> | null>(null);
  // The key of the options on screen; a result for any other key is dropped.
  const wantedKeyRef = useRef(buildKey('medium', 100, false));
  // What a tap queued: a Download tap delivers when the build lands.
  const pendingTapRef = useRef<'download' | 'share' | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const buildRef = useRef<(key: string, signal: AbortSignal) => Promise<Built>>(async () => { throw new StaleRun(); });
  const applyRef = useRef<(key: string, built: Built) => void>(() => {});
  const failRef = useRef<(key: string, err: unknown) => void>(() => {});
  // The file gate: closed from the moment a file is accepted until it may run (an image at once, a PDF once
  // its encryption check says it is not locked), and while a password is needed. No build starts behind it.
  const runnableRef = useRef(false);
  const currentFileRef = useRef<File | null>(null);

  const kind = deriveFileKind(file);
  // An image has only Exact size, so it gets the size field instead of the level picker.
  const isImageMode = kind === 'image';
  const targetSizePresets = isImageMode ? IMAGE_TARGET_SIZE_PRESETS_KB : TARGET_SIZE_PRESETS_KB;

  // Before/after preview (SEO-25, extended to images 2026-09-12) - see
  // openCompare below. The compressed Blob itself never needs to be
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
  // never returns the input, it always re-encodes). The notice paragraph
  // below replaces the re-encode warning with an honest "untouched" one.
  const [passthrough, setPassthrough] = useState(false);
  // A PDF passthrough that is not the "already under target" kind: re-rendering
  // it would only have made it bigger, so the input is handed back as it is.
  // Everything that calls the result "compressed" (title, button, file name)
  // reads this instead.
  const [unchanged, setUnchanged] = useState(false);
  // Object URLs created for the image-mode comparison (see openCompare)
  // aren't run through `useObjectUrls` like `downloadUrl` is: that hook's own
  // `url` lands a render after `setBlob` is called, but both sides need to
  // land in `comparePreviews` together in the same tick so the render below
  // stays one branch shared with the PDF path. Tracked here purely so they
  // can be revoked the same way `useObjectUrls` revokes the download URL.
  const compareImageUrlsRef = useRef<{ before: string; after: string } | null>(null);
  // Page 1 of the ORIGINAL, rendered once when the file is accepted and shown
  // while the run is in flight; openCompare then reuses it as the slider's
  // "before" so only the compressed page is rendered after the run. It belongs
  // to the file, not to a run, so resetOutput leaves it alone. The promise lets
  // openCompare wait for a render still pending (null when it failed).
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  // True while the original is still rendering or decoding, so a result that lands first holds its place.
  const [originalPending, setOriginalPending] = useState(false);
  const originalTokenRef = useRef(0);
  const originalPromiseRef = useRef<Promise<string | null> | null>(null);
  const originalImageUrlRef = useRef<string | null>(null);

  const clearOriginalPreview = () => {
    originalTokenRef.current += 1;
    originalPromiseRef.current = null;
    if (originalImageUrlRef.current) URL.revokeObjectURL(originalImageUrlRef.current);
    originalImageUrlRef.current = null;
    setOriginalPreview(null);
    setOriginalPending(false);
  };

  useEffect(() => () => {
    if (originalImageUrlRef.current) URL.revokeObjectURL(originalImageUrlRef.current);
  }, []);

  const loadOriginalPreview = (source: File) => {
    const token = originalTokenRef.current;
    setOriginalPending(true);
    if (deriveFileKind(source) === 'image') {
      const url = URL.createObjectURL(source);
      originalImageUrlRef.current = url;
      originalPromiseRef.current = decoded(url).then((u) => {
        if (token === originalTokenRef.current) {
          setOriginalPreview(u);
          setOriginalPending(false);
        }
        return u;
      });
      return;
    }
    const width = comparePreviewWidth(window.innerWidth, window.devicePixelRatio || 1, 768);
    originalPromiseRef.current = (async () => {
      try {
        const { renderComparePreview } = await import('../../lib/thumbnails.js');
        const url = await decoded(await renderComparePreview(source, width));
        if (token === originalTokenRef.current) {
          setOriginalPreview(url);
          setOriginalPending(false);
        }
        return url as string;
      } catch (err) {
        if (token === originalTokenRef.current) {
          setOriginalPending(false);
          reportError('pdf_render', err, 'render_compare_preview');
          console.error(err);
        }
        return null;
      }
    })();
  };

  const clearComparePreviews = () => {
    if (compareImageUrlsRef.current) {
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
    setResultKey(null);
    setTapped(false);
    setTap('idle');
    pendingTapRef.current = null;
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
  // Playwright run (src/tools/compress/e2e/compare-preview.spec.js, 4x CPU throttling,
  // 390x844 viewport) measured this panel opening in well under a second;
  // see that spec for the recorded number, timed from the done status
  // to the slider's auto-open rather than from a tap.
  // The image path has no equivalent rasterization cost to measure - it's
  // two `URL.createObjectURL` calls on bytes already decoded a moment
  // earlier by the compressor itself.
  //
  // It is called when a result lands (applyBuilt clears the previous previews just before), so it reads
  // the file and blob from refs: the closure it runs in can be a render behind.
  const openCompare = async () => {
    const activeFile = currentFileRef.current;
    const activeBlob = compressedBlobRef.current;
    if (!activeFile || !activeBlob) return;

    if (deriveFileKind(activeFile) === 'image') {
      const before = originalImageUrlRef.current ?? URL.createObjectURL(activeFile);
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
      const [pending, after] = await Promise.all([
        originalPromiseRef.current ?? Promise.resolve(null),
        renderComparePreview(activeBlob, width),
      ]);
      const before = pending ?? await renderComparePreview(activeFile, width);
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
      // A new file gets a new preparer, and so an empty cache; the old one drops its build.
      preparerRef.current?.dispose();
      preparerRef.current = createQuietPreparer<Built>({
        build: (key, signal) => buildRef.current(key, signal),
        onReady: (key, built) => applyRef.current(key, built),
        onError: (key, err) => failRef.current(key, err),
        policy: quietPolicy,
      });
      runnableRef.current = false;
      currentFileRef.current = next;
      setFile(next);
      resetOutput();
      clearOriginalPreview();
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
        loadOriginalPreview(next);
        openGate();
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
        loadOriginalPreview(pdf);
        openGate();
        return;
      }
      setNeedsUnlockBytes(bytes);
      setAnnouncement(t.protectedNeedsPasswordTitle);
    } catch (err) {
      console.error(err);
      if (!run.isCurrent()) return;
      run.settle();
      reportError('pdf_tool_run', err, 'check_encryption');
      loadOriginalPreview(pdf);
      openGate();
    }
  };

  // MERGE-14: a merged PDF handed off from /merge/ (saveHandoff + navigate)
  // is collected here on mount and dropped straight into the same path a
  // manual pick takes. This tool has no draft to race against, so mount is
  // enough - see useHandoffIntake.ts's own comment for why Sign/Redact
  // instead resolve their hand-off ahead of a draft restore.
  useHandoffIntake('compress', (file) => handleFilesAdded([file]));

  // The result on screen was built for exactly the options on screen. Until then it is the last one, kept silently.
  const currentKey = buildKey(level, targetKB, flatten);
  const fresh = resultKey !== null && resultKey === currentKey;

  // The gate opens: the file may run, so the first build starts now. Not after the quiet wait - nothing
  // has changed yet that a person is still adjusting.
  const openGate = () => {
    runnableRef.current = true;
    setStatus('processing');
    preparerRef.current?.change(wantedKeyRef.current);
    preparerRef.current?.now();
  };

  // Guideline §2, "Quiet means quiet": an option change invalidates what a late build would land, then
  // waits for the person to go quiet. The last result stays on screen, silent, until the new one lands;
  // a key already built is instant. Behind a closed gate it only records the key the gate will use.
  const changeKey = (key: string) => {
    wantedKeyRef.current = key;
    runTokenRef.current += 1;
    pendingTapRef.current = null;
    setTapped(false);
    setTap('idle');
    setCompareStatus('idle');
    setFullscreenStatus('idle');
    if (status === 'error') setStatus('processing');
    if (runnableRef.current) preparerRef.current?.change(key);
  };

  const preparerNow = () => preparerRef.current?.now();

  useEffect(() => () => preparerRef.current?.dispose(), []);

  const handleLevelChange = (nextLevel: Level) => {
    if (nextLevel === level) return;
    setLevel(nextLevel);
    recordAction('change_setting');
    reportEdit(analyticsTool);
    changeKey(buildKey(nextLevel, targetKB, flatten));
  };

  const handleFlattenChange = (next: boolean) => {
    setFlatten(next);
    recordAction('change_setting');
    reportEdit(analyticsTool);
    changeKey(buildKey(level, targetKB, next));
  };

  // The quiet policy covers typing too: every keystroke is a change, and only the last one builds.
  const handleTargetKBChange = (nextTargetKB: number) => {
    const next = Number.isFinite(nextTargetKB) && nextTargetKB > 0 ? nextTargetKB : 1;
    setTargetKB(next);
    recordAction('change_setting');
    reportEdit(analyticsTool);
    changeKey(buildKey(level, next, flatten));
  };

  // One build: reads the options from its key and the file from the ref (the render that carries them may
  // not have happened yet), and touches no state but the run counter and the ring. It returns what to land.
  const build = async (key: string, signal: AbortSignal): Promise<Built> => {
    const activeFile = currentFileRef.current;
    if (!runnableRef.current || !activeFile) throw new StaleRun();
    const [keyLevel, keyKB, keyFlatten] = key.split('|');
    const lv = keyLevel as Level;
    const kb = Number(keyKB);
    const flat = keyFlatten === 'true';
    // Read before the first await: a drop or Replace pick, or an option change, swaps the token under a
    // run in flight, and then it lands nothing and moves no ring.
    const runToken = runTokenRef.current;
    const isCurrent = () => runToken === runTokenRef.current && !signal.aborted;
    const onProgress = (p: number) => {
      if (isCurrent()) setProgress(p);
    };
    const isImage = deriveFileKind(activeFile) === 'image';
    recordAction('export');
    setRunCount((n) => n + 1);
    setProgress(0);

    if (isImage) {
      const result = await compressImageToTarget(activeFile, { targetKB: kb, onProgress });
      if (!isCurrent()) throw new StaleRun();
      const resultType = result.blob.type || 'image/jpeg';
      return {
        blob: result.blob,
        filename: deriveDownloadName(activeFile.name, resultType),
        outputType: resultType,
        metTarget: result.metTarget,
        // compressImageToTarget's passthrough rule returns the input File itself as `blob` when it was
        // already under target - reference equality is exactly that check.
        passthrough: result.blob === activeFile,
        unchanged: false,
        rasterBytes: null,
        imageReason: null,
        keptBytes: 0,
        resultImageBytes: 0,
        dimensions: { width: result.width, height: result.height, originalWidth: result.originalWidth, originalHeight: result.originalHeight },
        announcement: result.metTarget ? t.imageComplete : t.missedTarget,
      };
    }

    if (!flat) {
      const { compressPdfImages, compressPdfImagesToTarget, IMAGE_LEVELS } = await import('./compressImages.js');
      const result: { blob: Blob; metTarget?: boolean; reason: string; keptBytes?: number; imageBytes?: number } = lv === 'target'
        ? await compressPdfImagesToTarget(activeFile, { targetKB: kb, onProgress })
        : await compressPdfImages(activeFile, { ...IMAGE_LEVELS[lv as 'high' | 'medium' | 'low'], onProgress });
      if (!isCurrent()) throw new StaleRun();
      const imageBlob = result.blob;
      const resultType = imageBlob.type || 'application/pdf';
      const isPassthrough = imageBlob === activeFile;
      const isUnchanged = isPassthrough && result.reason !== 'under-target';
      return {
        blob: imageBlob,
        filename: deriveDownloadName(activeFile.name, resultType),
        outputType: resultType,
        metTarget: result.metTarget ?? true,
        passthrough: isPassthrough,
        unchanged: isUnchanged,
        rasterBytes: null,
        imageReason: result.reason,
        keptBytes: result.keptBytes ?? 0,
        resultImageBytes: result.imageBytes ?? 0,
        dimensions: null,
        announcement: result.reason === 'encrypted' ? t.lockedTitle
          : result.reason === 'unsupported' ? t.unsupportedTitle
            : isUnchanged ? t.alreadySmallComplete : t.complete,
      };
    }

    let compressedBlob: Blob;
    let didMeetTarget = true;
    let resultRasterBytes: number | null = null;
    if (lv === 'target') {
      const result = await compressPdfToTarget(activeFile, { targetKB: kb, onProgress });
      compressedBlob = result.blob;
      didMeetTarget = result.metTarget;
      resultRasterBytes = result.rasterBytes;
    } else {
      const result = await compressPdf(activeFile, { level: lv, onProgress });
      compressedBlob = result.blob;
      resultRasterBytes = result.rasterBytes;
    }
    if (!isCurrent()) throw new StaleRun();
    const resultType = compressedBlob.type || 'application/pdf';
    // compressPdfToTarget's passthrough rule returns the input File itself as `blob` when it was already
    // under target; compressPdf with a level never returns the input, it always re-encodes.
    const isPassthrough = compressedBlob === activeFile;
    // Under target is the only passthrough that is a success; every other one (a level, or a target the
    // input is still over) means the input was already as small as it gets.
    const isUnchanged = isPassthrough && (lv !== 'target' || !didMeetTarget);
    return {
      blob: compressedBlob,
      filename: deriveDownloadName(activeFile.name, resultType),
      outputType: resultType,
      metTarget: didMeetTarget,
      passthrough: isPassthrough,
      unchanged: isUnchanged,
      rasterBytes: resultRasterBytes,
      imageReason: null,
      keptBytes: 0,
      resultImageBytes: 0,
      dimensions: null,
      announcement: isUnchanged ? t.alreadySmallComplete : t.complete,
    };
  };

  // A build landed, fresh or from the cache. A result for any other key than the one on screen is dropped.
  const applyBuilt = (key: string, built: Built) => {
    if (key !== wantedKeyRef.current) return;
    setResultKey(key);
    clearComparePreviews();
    setCompareStatus('idle');
    setCompressedSize(built.blob.size);
    setRasterBytes(built.rasterBytes);
    setMetTarget(built.metTarget);
    setImageReason(built.imageReason);
    setKeptBytes(built.keptBytes);
    setResultImageBytes(built.resultImageBytes);
    setOutputType(built.outputType);
    setDimensions(built.dimensions);
    setPassthrough(built.passthrough);
    setUnchanged(built.unchanged);
    compressedBlobRef.current = built.blob;
    // A passthrough has nothing to download: the output is the input.
    if (built.passthrough) {
      clearDownload();
      clearPrepared();
      pendingTapRef.current = null;
    } else {
      setDownloadBlob(built.blob);
      prepareFiles([{ blob: built.blob, filename: built.filename, type: built.outputType }]);
    }
    setStatus('done');
    setTapped(false);
    setAnnouncement(built.announcement);
    // Open by default (SEO-25, 2026-09-12): see openCompare's comment. Not for a passthrough, whose slider
    // would hold the same bytes on both sides.
    if (!built.passthrough) void openCompare();
  };

  const failBuilt = (key: string, err: unknown) => {
    // expected: a superseded build is dropped on purpose and is not a failure
    if (err instanceof StaleRun || (err as { name?: string })?.name === 'AbortError' || key !== wantedKeyRef.current) return;
    reportError('pdf_tool_run', err, 'compress');
    console.error(err);
    resetOutput();
    setStatus('error');
    setAnnouncement(currentFileRef.current && deriveFileKind(currentFileRef.current) === 'image' ? t.imageFailed : t.failed);
  };

  buildRef.current = build;
  applyRef.current = applyBuilt;
  failRef.current = failBuilt;

  // Try again after a failed run: a tap, so the compressing look shows, and the build starts at once.
  const retry = () => {
    setTap('processing');
    setTapped(true);
    setStatus('processing');
    setProgress(0);
    preparerRef.current?.change(wantedKeyRef.current);
    preparerNow();
  };

  // A tap on Download before the build is done: show the compressing look and deliver when it lands.
  const onDownloadClick = (event: MouseEvent) => {
    if (fresh && downloadUrl) {
      recordAction('download');
      setTap('processing');
      return;
    }
    event.preventDefault();
    setTap('processing');
    pendingTapRef.current = 'download';
    setTapped(true);
    setProgress(0);
    setAnnouncement(kind === 'image' ? t.imageStarting : t.starting);
    preparerNow();
  };

  // The tap's delivery: the result is fresh and its link is on screen, so the download goes out.
  useEffect(() => {
    if (!fresh || pendingTapRef.current === null) return;
    if (pendingTapRef.current === 'download' && downloadUrl && !passthrough) {
      pendingTapRef.current = null;
      sheetRef.current?.querySelector<HTMLAnchorElement>('a[download]')?.click();
    } else if (pendingTapRef.current === 'share' || passthrough) {
      pendingTapRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, downloadUrl, passthrough]);

  // The tapped result is delivered: 'processing' rendered once so BasePdfTool reported the start.
  useEffect(() => {
    if (tap === 'processing' && fresh && status === 'done' && pendingTapRef.current === null) setTap('done');
  }, [tap, fresh, status, downloadUrl, passthrough]);

  const handleShare = async () => {
    // The prepared files belong to the last result; a stale one waits for the new build instead.
    if (!fresh) {
      pendingTapRef.current = 'share';
      setTapped(true);
      setProgress(0);
      preparerNow();
      return;
    }
    const result = await sharePrepared();
    if (result.status === 'shared') recordAction('share');
    if (result.status === 'shared') setTap('processing');
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
  // is this line, inside the Download button. compressedSize is only
  // ever set alongside status 'done', so this stays undefined otherwise.
  // A smaller result says only its size (the saving is the strip's tag).
  // t.downloadDetailClosest is its own short message, deliberately separate
  // from t.closestAchievable (a full sentence meant for the notice paragraph
  // below, not a button's second line).
  const downloadDetail = compressedSize == null
    ? undefined
    : missedTargetSize
      ? formatMessage(t.downloadDetailClosest, { size: sizeText(compressedSize) })
      : savingsPercent > 0 && !unchanged
        ? sizeText(compressedSize)
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
  // Before the first result the build is silent too: Download shows the original size in its ready look.
  const awaitingFirst = hasFiles && status === 'processing' && !tapped && compressedSize == null;
  const tappedBusy = hasFiles && tapped && !fresh && status !== 'error';
  const showCompare = isDone && !passthrough;
  const hasSheet = tappedBusy || awaitingFirst || (hasFiles && status === 'error') || (isDone && !passthrough && !!downloadUrl);
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

  // What the specs wait on: 'done' only while the result on screen is the one the options ask for, even
  // though a stale result stays on screen silently.
  const statusAttr = status === 'done' && !fresh ? 'processing' : status;

  const arrow = t.dir === 'rtl' ? '←' : '→';

  // The shell strip's meta line: before to after, and the citron tag. Quiet: until a new build lands it keeps
  // the last result's numbers (or the original alone, before the first result).
  const savedLabel = isDone && !passthrough && savingsPercent > 0 ? formatMessage(t.percentSmaller, { percent: savingsPercent }) : null;
  const sizesExtra = file && (
    <span class={styles.sizes} data-compress-sizes>
      <bdi class={styles.before}>{formatBytes(file.size)}</bdi>
      {isDone && !passthrough && compressedSize != null && (
        <>
          <span aria-hidden="true">{arrow}</span>
          <b>
            <bdi>{formatBytes(compressedSize)}</bdi>
          </b>
        </>
      )}
      {savedLabel && <span class={styles.saved}>{savedLabel}</span>}
    </span>
  );

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

  // One row above the preview: the compressed side on the left, the original
  // on the right (where the tags sat), each with its size.
  const labelRow = (afterText: string) => (
    <p class={styles['compare-labels']}>
      <span><bdi>{afterText}</bdi></span>
      <span><bdi>{t.compareBeforeLabel} · {formatBytes(file?.size ?? 0)}</bdi></span>
    </p>
  );
  const originalBox = originalPreview && (
    <div key="original" class={styles['compare-original']}>
      <img src={originalPreview} alt={`${t.compareBeforeLabel} - page 1`} draggable={false} />
    </div>
  );

  const resultSection = (
    <section class={styles.result}>
      {hasFiles && status !== 'done' && status !== 'error' && (
        // Keyed apart: reused, the skeleton's own box would move and shrink into the panel's, a
        // layout shift (0.116 at 1440x820, DEBT-56); replaced, the panel is new content.
        originalPreview ? (
          <div key="panel" class={styles['compare-panel']}>
            {labelRow(t.compressing)}
            {originalBox}
          </div>
        ) : (
          // Only the page's placeholder: the progress itself is the sheet's
          // button (Download's place), so it is said once, not twice.
          <div key="skeleton" class={styles['compare-skeleton']} aria-hidden="true" />
        )
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
              {labelRow(`${t.compareAfterLabel} · ${formatBytes(compressedSize ?? 0)}`)}
              <CompareSlider
                tags={false}
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
      {isDone && passthrough && (originalBox || (originalPending && <div key="original-skeleton" class={styles['compare-skeleton']} aria-hidden="true" />))}
      {isDone && imageReason === 'smaller' && level === 'target' && !metTarget && (
        <p class={styles['compress-warning']}>
          {formatMessage(t.imagesTargetMissedNotice, { size: sizeText(compressedSize as number), target: sizeText(targetKB * 1024) })}
        </p>
      )}
    </section>
  );

  const downloadLabel = kind === 'image' ? t.imageDownloadLabel : t.downloadLabel;
  const sheet = (
    <div
      ref={sheetRef}
      class={`${styles['result-action']}${hasSheet ? ` ${styles['result-sheet']}` : ''}`}
      hidden={!hasSheet}
      onPointerEnter={preparerNow}
      onFocusIn={preparerNow}
      onPointerDown={preparerNow}
    >
      {hasFiles && status === 'error' ? (
        <button type="button" class={pdfToolStyles['tool-primary-action']} onClick={retry}>
          {t.tryAgain}
        </button>
      ) : tappedBusy ? (
        <button type="button" class={`${pdfToolStyles['tool-primary-action']} ${pdfToolStyles['is-processing']}`} disabled>
          <ProgressRing progress={progress} label={t.compressing} />
        </button>
      ) : isDone && !passthrough && downloadUrl ? (
        <>
          <DownloadButton
            autoFocus={false}
            href={downloadUrl}
            download={deriveDownloadName(file!.name, outputType)}
            label={downloadLabel}
            detail={downloadDetail}
            onClick={onDownloadClick}
          />
          <PdfShareButton visible={shareReady} onShare={handleShare} label={kind === 'image' ? t.imageShareLabel : t.shareLabel} />
        </>
      ) : awaitingFirst && file ? (
        // No result yet: the ready look with the size it already knows. A tap here waits for the build.
        <DownloadButton
          autoFocus={false}
          href="#"
          download={deriveDownloadName(file.name, file.type)}
          label={downloadLabel}
          detail={formatBytes(file.size)}
          onClick={onDownloadClick}
        />
      ) : null}
    </div>
  );

  return (
    <BasePdfTool
      emptyArt={<CompressVerb subject={analyticsTool === 'compress-image' ? 'photo' : 'page'} />}
      hasFiles={hasFiles}
      analyticsTool={analyticsTool}
      analyticsStatus={status === 'error' ? 'error' : tap}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      accept="application/pdf,image/jpeg,image/png"
      emptyStateMessage={emptyStateMessage ?? t.dropHint}
      file={file}
      fileLabel={file?.name}
      fileMetaExtra={sizesExtra}
      fileNote={<span data-compress-note>{stripNote}</span>}
      shellMessages={shellMessages}
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
        <div class={styles['loaded-layout']} data-compress-status={statusAttr} data-compress-run={runCount}>
          {/* The shell's own strip, placed here rather than above the card so a
              desktop shows it in the rail beside the result (UX guidelines §18
              rule 3). Its content still comes from the props above. */}
          <div class={styles.strip}>
            <ToolShell flush>
              <FileActions />
            </ToolShell>
          </div>
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
