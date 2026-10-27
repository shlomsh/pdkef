import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { QuietPolicy } from '../../lib/quietPrepare.ts';
import { usePreparedOutput, type Built } from '../../lib/usePreparedOutput.ts';
import { probeEncryption } from '../../lib/pdfEncryption.ts';
import { useLatestRun } from '../../lib/useLatestRun.ts';
import NeedsUnlock from '../../shell/NeedsUnlock.tsx';
import { compressPdf, compressPdfToTarget } from './compress.js';
import { compressImageToTarget } from './compressImage.js';
import { deriveFileKind } from '../../lib/fileKind.js';
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
import { useComparePreviews } from './useComparePreviews.ts';
import { useDownloadFlow, type DownloadFlowInput } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import { useLastResult } from './useLastResult.ts';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { isolateLtr, isolateName } from '../../lib/format.js';
import type { AnalyticsTool } from '../../lib/productAnalytics.ts';
import { englishCompressMessages, type CompressMessages } from './messages';
import { type ShellMessages } from '../../shell/shellMessages';
import { formatMessage } from '../../lib/formatMessage';
import { throwIfAborted } from '../../lib/abort.js';
import { openPdfDoc } from '../../lib/openPdfDoc.ts';
import { reportError } from '../../lib/errorReport.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import { reportEdit } from '../../lib/productAnalytics.ts';
import { compressedFileName as deriveDownloadName } from './outputName.ts';
import { isCurrentAnalysis, isCurrentRun } from './state/compressMachine.ts';
import { useCompressMachine } from './state/useCompressMachine.ts';

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

/** The state a build depends on, with the file's number so a new file never reuses an old result. */
const buildKey = (fileSeq: number, level: string, targetKB: number, flatten: boolean) => `${fileSeq}|${level}|${targetKB}|${flatten}`;

/** What a finished build hands the island beside its blob, so a cached one lands exactly as a fresh one. */
interface CompressMeta {
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

/** The build is superseded: usePreparedOutput drops an AbortError without reporting it. */
const superseded = (): never => {
  throwIfAborted({ aborted: true });
  throw new Error('unreachable');
};

// Compress offers no hand-offs from its Download.
const NO_HANDOFFS: DownloadFlowInput['hrefs'] = {};

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
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  // ENC-08: the bytes of a PDF that needs a password. Set means the level picker and the result give
  // way to NeedsUnlock (src/shell/NeedsUnlock.tsx); every new pick clears it before the check runs again.
  const [needsUnlockBytes, setNeedsUnlockBytes] = useState<ArrayBuffer | null>(null);
  const encryptionCheck = useLatestRun();
  // COMP-01: what the PDF is made of (images, text), read once it is added so the tool can say
  // before any click that there is nothing to shrink. Never gates anything else.
  const [analysis, setAnalysis] = useState<{ images: unknown[]; hasText: boolean; imageShare: number; pageCount: number } | null>(null);
  // COMP-01: by default only the images are recompressed and every page stays as it is; true turns
  // the pages into pictures (compress.js). Survives a new file, like the level.
  const [flatten, setFlatten] = useState(false);
  // The run lifecycle (gate, tokens, run count, the Download/Share and Try again taps) is one machine
  // (state/compressMachine.ts); `machine.state` is what this render sees, `machine.read()` the live value.
  const machine = useCompressMachine();
  const { runnable, runCount, tapped, retryTap } = machine.state;
  const sheetRef = useRef<HTMLDivElement | null>(null);
  // Which opened file the builds belong to; it is in the build key, so a new file never lands an old result.
  const [fileSeq, setFileSeq] = useState(0);
  const currentFileRef = useRef<File | null>(null);
  // The build reads the options on screen through this, as usePreparedOutput asks.
  const optionsRef = useRef({ level, targetKB, flatten });
  optionsRef.current = { level, targetKB, flatten };
  // The latest build, failure and landing callbacks, assigned during render, as usePreparedOutput asks.
  const callbacksRef = useRef<{
    build: (signal: AbortSignal, onProgress: (fraction: number) => void) => Promise<Built<CompressMeta>>;
    fail: (err: unknown) => void;
    land: (built: Built<CompressMeta>) => void;
  }>({ build: async () => { throw superseded(); }, fail: () => {}, land: () => {} });

  // The machine's run token is bumped on every change that invalidates an in-flight run (new file,
  // option change, failure). A build and the previews capture it before their first await and check it
  // after, so a run that outlives its file or its options lands nothing.
  const compare = useComparePreviews({ runTokenRef: machine.runTokenRef });

  // Guideline §2, "Quiet means quiet": usePreparedOutput builds once the person goes quiet and caches
  // by key, so a state already built is instant. The first build of a file starts at once (below).
  const prepared = usePreparedOutput<CompressMeta>({
    cacheScope: fileSeq,
    // Registered at once so the gate can start it with no render in between; behind a closed gate nothing builds.
    key: file ? buildKey(fileSeq, level, targetKB, flatten) : null,
    autoBuild: runnable,
    build: (signal, onProgress) => callbacksRef.current.build(signal, onProgress),
    onBuildError: (err) => callbacksRef.current.fail(err),
    onReady: (built) => callbacksRef.current.land(built),
    quietPolicy,
  });
  // The last result stays on screen, silent, until the new one lands.
  const { last, forget: forgetLast } = useLastResult(prepared);
  const fresh = prepared.status === 'ready';
  const meta = last?.meta ?? null;
  const compressedSize = last ? last.blob.size : null;
  const downloadUrl = last?.url ?? null;
  const metTarget = meta?.metTarget ?? true;
  const outputType = meta?.outputType ?? '';
  const dimensions = meta?.dimensions ?? null;
  const rasterBytes = meta?.rasterBytes ?? null;
  // True when either compressor's passthrough rule fired (the file was already under target, so the
  // "compressed" blob is literally the input File). The notice paragraph replaces the re-encode
  // warning with an honest "untouched" one, and no download is offered.
  const passthrough = meta?.passthrough ?? false;
  // A PDF passthrough that is not the "already under target" kind: re-rendering it would only have
  // made it bigger, so the input is handed back as it is.
  const unchanged = meta?.unchanged ?? false;
  const imageReason = meta?.imageReason ?? null;
  const keptBytes = meta?.keptBytes ?? 0;
  const resultImageBytes = meta?.resultImageBytes ?? 0;
  const progress = prepared.progress;
  const status = prepared.status === 'error' ? 'error' : last ? 'done' : runnable ? 'processing' : 'idle'; // idle | processing | done | error
  useHoldUpdate(status === 'processing');
  useHoldUpdate(file !== null, 'open');

  const kind = deriveFileKind(file);
  // An image has only Exact size, so it gets the size field instead of the level picker.
  const isImageMode = kind === 'image';
  const targetSizePresets = isImageMode ? IMAGE_TARGET_SIZE_PRESETS_KB : TARGET_SIZE_PRESETS_KB;

  const flow = useDownloadFlow({
    // A passthrough is the input itself: nothing to deliver or share.
    prepared: { status: prepared.status, blob: prepared.meta?.passthrough ? null : prepared.blob, url: prepared.url, parts: null, generation: prepared.generation, prepareNow: prepared.prepareNow },
    fileName: meta?.filename ?? '',
    hrefs: NO_HANDOFFS,
    blocked: prepared.status === 'error' ? 'error' : null,
    announce: (message) => { if (message) setAnnouncement(message); },
    messages: {
      ready: '',
      shared: kind === 'image' ? t.imageSharedSuccessfully : t.sharedSuccessfully,
      canceled: kind === 'image' ? t.imageSharingCanceled : t.sharingCanceled,
      shareError: t.shareError,
    },
  });
  // Share stays on screen while a newer result builds, as it did before the shared flow.
  const shareSeenRef = useRef(false);
  if (flow.shareReady) shareSeenRef.current = true;
  else if (!last) shareSeenRef.current = false;
  const shareVisible = flow.shareReady || shareSeenRef.current;

  const handleFilesAdded = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    const accepted = incoming.filter((f) => deriveFileKind(f) !== null);
    const rejected = incoming.filter((f) => deriveFileKind(f) === null);

    setRejectedFiles(rejected.length > 0 ? rejected.map((f) => f.name) : []);

    if (accepted.length > 0) {
      const next = accepted[0];
      // A new file's key differs from the old one's, so the old build is dropped and its cache never hit.
      machine.send({ type: 'fileAccepted' });
      setFileSeq((n) => n + 1);
      currentFileRef.current = next;
      setFile(next);
      forgetLast();
      flow.reset();
      compare.clear();
      compare.clearOriginal();
      setAnnouncement(formatMessage(deriveFileKind(next) === 'image' ? t.imageLoaded : t.loaded, { name: next.name }));
      recordAction('add_files');
      setNeedsUnlockBytes(null);
      encryptionCheck.invalidate();
      setAnalysis(null);
      if (deriveFileKind(next) === 'pdf') {
        // reason: checkEncryption catches and reports its own failure
        void checkEncryption(next);
        // reason: analyze catches and reports its own failure
        void analyze(next);
      } else {
        compare.loadOriginal(next);
        openGate();
      }
    }
  };

  // Reads the PDF's make-up for the "nothing to shrink" note. A newer file wins: a stale result is dropped.
  const analyze = async (pdf: File) => {
    const token = machine.read().analysisToken;
    await analyzeInner(pdf, token);
  };

  const analyzeInner = async (pdf: File, token: number) => {
    let doc;
    let totalBytes = 0;
    try {
      // A restricted PDF opens with an empty password so text detection sees plaintext, not ciphertext.
      const opened = await openPdfDoc(pdf, { encryption: 'empty-password', updateMetadata: false });
      doc = opened.doc;
      totalBytes = opened.bytes.byteLength;
    } catch {
      // expected: a PDF pdf-lib can't parse just gets no analysis note
      return;
    }
    try {
      // Dynamic: analyzePdf.js pulls in pdf-lib, which must not ride in the first download (DEBT-20).
      const { analyzePdf } = await import('./analyzePdf.js');
      const result = analyzePdf(doc, { totalBytes });
      if (isCurrentAnalysis(machine.read(), token)) setAnalysis(result);
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
        compare.loadOriginal(pdf);
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
      compare.loadOriginal(pdf);
      openGate();
    }
  };

  // MERGE-14: a merged PDF handed off from /merge/ (saveHandoff + navigate)
  // is collected here on mount and dropped straight into the same path a
  // manual pick takes. This tool has no draft to race against, so mount is
  // enough - see useHandoffIntake.ts's own comment for why Sign/Redact
  // instead resolve their hand-off ahead of a draft restore.
  useHandoffIntake('compress', (file) => handleFilesAdded([file]));

  // The gate opens: the file may run, so the first build starts now. Not after the quiet wait - nothing
  // has changed yet that a person is still adjusting. usePreparedOutput registers a key while rendering, so
  // once the render that carries this file has run the build starts in this very tick; if the password
  // check beat that render, the effect below starts it right after, and never for the old file's key.
  const renderedFileRef = useRef<File | null>(null);
  renderedFileRef.current = file;
  const openGate = () => {
    machine.send({ type: 'gateOpened' });
    if (renderedFileRef.current === currentFileRef.current) prepared.prepareNow();
  };
  useEffect(() => {
    // Not after a failure: prepareNow would read that as Try again.
    if (machine.read().runnable && prepared.status !== 'error') prepared.prepareNow();
  }, [runnable, fileSeq]);

  // An option change invalidates what a late build would land (usePreparedOutput aborts it and waits for
  // the person to go quiet); a key already built is instant. The last result stays on screen meanwhile.
  const onOptionChange = () => {
    machine.send({ type: 'optionChanged' });
    flow.reset();
    compare.resetStatus();
  };

  // Hover, focus and press warm the build; after a failure only Try again starts it.
  const warmBuild = () => {
    if (prepared.status !== 'error') prepared.prepareNow();
  };

  const handleLevelChange = (nextLevel: Level) => {
    if (nextLevel === level) return;
    setLevel(nextLevel);
    recordAction('change_setting');
    reportEdit(analyticsTool);
    onOptionChange();
  };

  const handleFlattenChange = (next: boolean) => {
    if (next === flatten) return;
    setFlatten(next);
    recordAction('change_setting');
    reportEdit(analyticsTool);
    onOptionChange();
  };

  // The quiet policy covers typing too: every keystroke is a change, and only the last one builds.
  const handleTargetKBChange = (nextTargetKB: number) => {
    const next = Number.isFinite(nextTargetKB) && nextTargetKB > 0 ? nextTargetKB : 1;
    if (next === targetKB) return;
    setTargetKB(next);
    recordAction('change_setting');
    reportEdit(analyticsTool);
    onOptionChange();
  };

  // One build: reads the options and the file through refs (the render that carries them may not have
  // happened yet), and touches no state but the run counter. It returns what to land.
  const build = async (signal: AbortSignal, reportProgress: (fraction: number) => void): Promise<Built<CompressMeta>> => {
    const activeFile = currentFileRef.current;
    if (!machine.read().runnable || !activeFile) throw superseded();
    const { level: lv, targetKB: kb, flatten: flat } = optionsRef.current;
    // Read before the first await: a drop or Replace pick, or an option change, swaps the token under a
    // run in flight, and then it lands nothing and moves no ring.
    const runToken = machine.read().runToken;
    const isCurrent = () => isCurrentRun(machine.read(), runToken) && !signal.aborted;
    const onProgress = (p: number) => {
      if (isCurrent()) reportProgress(p);
    };
    const isImage = deriveFileKind(activeFile) === 'image';
    recordAction('export');
    machine.send({ type: 'buildStarted' });

    if (isImage) {
      const result = await compressImageToTarget(activeFile, { targetKB: kb, onProgress });
      if (!isCurrent()) throw superseded();
      const resultType = result.blob.type || 'image/jpeg';
      return {
        blob: result.blob,
        pageCount: 0,
        meta: {
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
        },
      };
    }

    if (!flat) {
            const { compressPdfImages, compressPdfImagesToTarget, IMAGE_LEVELS } = await import('./compressImages.js');
      const result: { blob: Blob; metTarget?: boolean; reason: string; keptBytes?: number; imageBytes?: number } = lv === 'target'
        ? await compressPdfImagesToTarget(activeFile, { targetKB: kb, onProgress })
        : await compressPdfImages(activeFile, { ...IMAGE_LEVELS[lv as 'high' | 'medium' | 'low'], onProgress });
      if (!isCurrent()) throw superseded();
      const imageBlob = result.blob;
      const resultType = imageBlob.type || 'application/pdf';
      const isPassthrough = imageBlob === activeFile;
      const isUnchanged = isPassthrough && result.reason !== 'under-target';
      return {
        blob: imageBlob,
        pageCount: 0,
        meta: {
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
        },
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
    if (!isCurrent()) throw superseded();
    const resultType = compressedBlob.type || 'application/pdf';
    // compressPdfToTarget's passthrough rule returns the input File itself as `blob` when it was already
    // under target; compressPdf with a level never returns the input, it always re-encodes.
    const isPassthrough = compressedBlob === activeFile;
    // Under target is the only passthrough that is a success; every other one (a level, or a target the
    // input is still over) means the input was already as small as it gets.
    const isUnchanged = isPassthrough && (lv !== 'target' || !didMeetTarget);
    return {
      blob: compressedBlob,
      pageCount: 0,
      meta: {
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
      },
    };
  };

  const fail = (err: unknown) => {
    reportError('pdf_tool_run', err, 'compress');
    setAnnouncement(currentFileRef.current && deriveFileKind(currentFileRef.current) === 'image' ? t.imageFailed : t.failed);
  };

  // A build landed, fresh or from the cache (usePreparedOutput drops one for any other key).
  const land = (built: Built<CompressMeta>) => {
    if (!built.meta || !('blob' in built)) return;
    machine.send({ type: 'buildLanded' });
    setAnnouncement(built.meta.announcement);
    compare.clear();
    // Open by default (SEO-25, 2026-09-12). Not for a passthrough, whose slider would hold the same bytes on both sides.
    if (!built.meta.passthrough) compare.open(currentFileRef.current, built.blob).catch((err) => reportError('pdf_render', err, 'compare_open'));
  };
  callbacksRef.current = { build, fail, land };

  // A failed build: nothing of the last result is kept, and the taps start over.
  useEffect(() => {
    if (prepared.status !== 'error') return;
    machine.send({ type: 'buildFailed' });
    compare.clear();
    flow.reset();
  }, [prepared.status === 'error']);

  // Try again after a failed run: a tap, so the compressing look shows, and the build starts at once.
  const retry = () => {
    machine.send({ type: 'retryTapped' });
    prepared.prepareNow();
  };

  // A passthrough has nothing to deliver: a Download tapped before it landed ends with the result, undelivered.
  useEffect(() => {
    if (fresh && passthrough && flow.tap === 'processing') {
      flow.reset();
      machine.send({ type: 'retrySettled' });
    }
  }, [fresh, passthrough, flow.tap]);
  // The retried result has landed: 'processing' rendered once so BasePdfTool reported the start.
  useEffect(() => {
    if (retryTap === 'processing' && fresh) machine.send({ type: 'retrySettled' });
  }, [retryTap, fresh]);

  // A tap on Download before the build is done: show the compressing look; the shared flow delivers when it lands.
  const onDownloadClick = (event: MouseEvent) => {
    if (fresh && downloadUrl) {
      flow.onDownloadTap();
      return;
    }
    event.preventDefault();
    machine.send({ type: 'busyTapped' });
    setAnnouncement(kind === 'image' ? t.imageStarting : t.starting);
    flow.onRowPreparingTap();
  };

  const handleShare = async () => {
    // The prepared files belong to the last result; a stale one waits for the new build instead.
    if (!fresh) {
      machine.send({ type: 'busyTapped' });
      prepared.prepareNow();
      return;
    }
    await flow.handleShare();
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

  const fullscreenDialog = compare.fullscreen.open && (
    <dialog
      ref={compare.fullscreen.dialogRef}
      class={styles['compare-fullscreen']}
      aria-label={t.compareFullscreenLabel}
      onClose={compare.fullscreen.onClosed}
    >
      <div class={styles['compare-fullscreen-header']}>
        <p class={styles['compare-caption']}>{compareCaption}</p>
        <button type="button" class={styles['compare-toggle-button']} onClick={compare.closeFullscreen}>
          {t.compareCloseLabel}
        </button>
      </div>
      <div class={styles['compare-fullscreen-body']}>
        {compare.fullscreen.status === 'loading' && (
          <>
            <div class={styles['compare-skeleton']} aria-hidden="true" />
            <p class={styles['compare-status']} aria-live="polite">{t.compareRendering}</p>
          </>
        )}
        {compare.fullscreen.status === 'error' && <p class={styles['compare-status']}>{t.compareRenderFailed}</p>}
        {compare.fullscreen.previews && (
          <CompareSlider
            fill
            beforeSrc={compare.fullscreen.previews.before}
            afterSrc={compare.fullscreen.previews.after}
            beforeLabel={t.compareBeforeLabel}
            afterLabel={t.compareAfterLabel}
            pageAlt={t.comparePageAlt}
            sliderLabel={t.compareSliderLabel}
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
  const originalBox = compare.original && (
    <div key="original" class={styles['compare-original']}>
      <img src={compare.original} alt={formatMessage(t.comparePageAlt, { label: t.compareBeforeLabel })} draggable={false} />
    </div>
  );

  const resultSection = (
    <section class={styles.result}>
      {hasFiles && status !== 'done' && status !== 'error' && (
        // Keyed apart: reused, the skeleton's own box would move and shrink into the panel's, a
        // layout shift (0.116 at 1440x820, DEBT-56); replaced, the panel is new content.
        compare.original ? (
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
          {compare.status === 'loading' && (
            <>
              {/* The visible "still working" placeholder in the slider's own shape; it never holds up Download. */}
              <div class={styles['compare-skeleton']} aria-hidden="true" />
              <p class={styles['compare-status']} aria-live="polite">{t.compareRendering}</p>
            </>
          )}
          {compare.status === 'error' && <p class={styles['compare-status']}>{t.compareRenderFailed}</p>}
          {compare.previews && (
            <>
              {labelRow(`${t.compareAfterLabel} · ${formatBytes(compressedSize ?? 0)}`)}
              <CompareSlider
                tags={false}
                beforeSrc={compare.previews.before}
                afterSrc={compare.previews.after}
                beforeLabel={t.compareBeforeLabel}
                afterLabel={t.compareAfterLabel}
                pageAlt={t.comparePageAlt}
                sliderLabel={t.compareSliderLabel}
              />
              <p class={styles['compare-caption']}>{compareCaption}</p>
              <button type="button" class={styles['compare-toggle-button']} onClick={() => { compare.openFullscreen(file, last?.blob ?? null).catch((err) => reportError('pdf_render', err, 'compare_open_fullscreen')); }}>
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
      {isDone && passthrough && (originalBox || (compare.originalPending && <div key="original-skeleton" class={styles['compare-skeleton']} aria-hidden="true" />))}
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
      onPointerEnter={warmBuild}
      onFocusIn={warmBuild}
      onPointerDown={warmBuild}
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
          <PdfShareButton visible={shareVisible} onShare={handleShare} label={kind === 'image' ? t.imageShareLabel : t.shareLabel} />
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
      analyticsStatus={status === 'error' ? 'error' : flow.tap !== 'idle' ? flow.tap : retryTap}
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
