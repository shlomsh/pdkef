import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { QuietPolicy } from '#lib/output/quietPrepare.ts';
import { usePreparedOutput } from '#lib/output/usePreparedOutput.ts';
import { useLatestRun } from '#lib/hooks/useLatestRun.ts';
import NeedsUnlock from '#shell/NeedsUnlock.tsx';
import { deriveFileKind } from '#lib/handoff/fileKind.js';
import BasePdfTool from '#shell/BasePdfTool.tsx';
import { withIslandBoundary } from '#lib/telemetry/IslandErrorBoundary.tsx';
import ToolShell, { FileActions } from '#shell/ToolShell.tsx';
import CompressVerb from './verb/CompressVerb.tsx';
import styles from './PdfCompressTool.module.css';
import pdfToolStyles from '#shell/PdfTool.module.css';
import LevelPicker, { TargetSizePanel, type Level } from './components/LevelPicker.tsx';
import ResultSection from './components/ResultSection.tsx';
import ResultSheet from './components/ResultSheet.tsx';
import ResultNotes, { hasResultNotes } from './components/ResultNotes.tsx';
import StripSizes from './components/StripSizes.tsx';
import { useComparePreviews } from './hooks/useComparePreviews.ts';
import { useDownloadFlow, type DownloadFlowInput } from '#shell/pageWorkspace/useDownloadFlow.ts';
import { useLastResult } from './hooks/useLastResult.ts';
import { useHoldUpdate } from '#lib/hooks/useHoldUpdate.ts';
import { isolateName } from '#lib/text/format.js';
import { englishCompressMessages, type CompressMessages } from './messages';
import { type ShellMessages } from '#shell/shellMessages.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { type AnalyticsTool } from '#lib/telemetry/productAnalytics.ts';
import { useCompressMachine } from './state/useCompressMachine.ts';
import { createCompressCallbacks, superseded, type CompressCallbacks, type CompressMeta } from './lib/compressCallbacks.ts';
import { useFileIntake, type PdfAnalysis } from './hooks/useFileIntake.ts';
import { useRunActions } from './hooks/useRunActions.ts';
import { deriveResultView } from './lib/resultView.ts';

const TARGET_SIZE_PRESETS_KB = [100, 200, 500, 1024];
// Lower than the PDF presets above: the image half of this tool's demand is
// the photo half of application portals, which commonly cap a photo at
// 20-50KB, tighter than the document limits the PDF presets target. Four, so
// they fit one row beside the KB field: 500KB went (Shlomi, 2026-10-15), a PDF
// cap rather than a photo one; any size can still be typed.
const IMAGE_TARGET_SIZE_PRESETS_KB = [20, 50, 100, 200];

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

// Compress offers no hand-offs from its Download.
const NO_HANDOFFS: DownloadFlowInput['hrefs'] = {};

export function formatShare(share: number, lessThanOnePercent = englishCompressMessages.lessThanOnePercent): string {
  return share < 0.01 ? lessThanOnePercent : `${Math.round(share * 100)}%`;
}


export default withIslandBoundary(function PdfCompressTool({
  messages: messagesProp,
  shellMessages,
  analyticsTool = 'compress',
  emptyStateMessage,
  quietPolicy,
}: PdfCompressToolProps = {}) {
  const t: CompressMessages = { ...englishCompressMessages, ...messagesProp };

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
  const [analysis, setAnalysis] = useState<PdfAnalysis | null>(null);
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
  const callbacksRef = useRef<CompressCallbacks>({ build: async () => { throw superseded(); }, fail: () => {}, land: () => {} });

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

  const { handleFilesAdded } = useFileIntake({
    t, machine, compare, flow, encryptionCheck, file, fileSeq, runnable, preparedStatus: prepared.status,
    prepareNow: prepared.prepareNow, forgetLast, currentFileRef,
    setFile, setFileSeq, setRejectedFiles, setAnnouncement, setNeedsUnlockBytes, setAnalysis,
  });

  callbacksRef.current = createCompressCallbacks({ t, machine, compare, currentFileRef, optionsRef, setAnnouncement });

  const { warmBuild, handleLevelChange, handleFlattenChange, handleTargetKBChange, retry, onDownloadClick, handleShare } = useRunActions({
    t, analyticsTool, kind, machine, compare, flow, prepared, fresh, passthrough, retryTap, downloadUrl,
    level, targetKB, flatten, setLevel, setTargetKB, setFlatten, setAnnouncement,
  });

  const hasFiles = !!file;
  const isDone = hasFiles && status === 'done';
  const view = deriveResultView({
    t, file, kind, level, targetKB, flatten, isDone, compressedSize, passthrough, unchanged, metTarget, rasterBytes,
    imageReason, keptBytes, resultImageBytes,
  });
  const { savingsPercent, downloadDetail, showFlatten } = view;

  // Before the first result the build is silent too: Download shows the original size in its ready look.
  const awaitingFirst = hasFiles && status === 'processing' && !tapped && compressedSize == null;
  const tappedBusy = hasFiles && tapped && !fresh && status !== 'error';
  const showCompare = isDone && !passthrough;
  const hasSheet = tappedBusy || awaitingFirst || (hasFiles && status === 'error') || (isDone && !passthrough && !!downloadUrl);
  const compareCaption = kind === 'image' ? t.compareCaptionImage : analysis?.pageCount === 1 ? t.compareCaptionPdfSingle : t.compareCaptionPdf;

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
  // What the specs wait on: 'done' only while the result on screen is the one the options ask for, even
  // though a stale result stays on screen silently.
  const statusAttr = status === 'done' && !fresh ? 'processing' : status;

  const arrow = t.dir === 'rtl' ? '←' : '→';
  // A photo never has a strip note, so the strip reserves no lines for one.
  const stripNoteNode = isImageMode ? undefined : <span data-compress-note>{stripNote}</span>;

  const sizesExtra = file && (
    <StripSizes t={t} file={file} arrow={arrow} showResult={isDone && !passthrough} compressedSize={compressedSize} savingsPercent={savingsPercent} />
  );

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      onFilesAdded={handleFilesAdded}
      intake={{ multiple: false, accept: 'application/pdf,image/jpeg,image/png' }}
      identity={{ file, label: file?.name, metaExtra: sizesExtra, note: stripNoteNode, hidden: true }}
      empty={{ art: <CompressVerb subject={analyticsTool === 'compress-image' ? 'photo' : 'page'} />, message: emptyStateMessage ?? t.dropHint }}
      analytics={{ tool: analyticsTool, status: status === 'error' ? 'error' : flow.tap !== 'idle' ? flow.tap : retryTap }}
      shellMessages={shellMessages}
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
        <div
          class={`${styles['loaded-layout']}${hasResultNotes({ view, isDone, passthrough }) ? ` ${styles['has-notes']}` : ''}`}
          data-compress-status={statusAttr}
          data-compress-run={runCount}
        >
          {/* The shell's own strip, placed here rather than above the card so a
              desktop shows it in the rail beside the result (UX guidelines §18
              rule 3). Its content still comes from the props above. */}
          <div class={styles.strip} data-strip>
            <ToolShell flush>
              <FileActions />
            </ToolShell>
          </div>
          <div class={styles.controls} data-controls>
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
              <label class={styles['flatten-switch']} data-flatten-switch>
                <input type="checkbox" checked={flatten} onChange={(e) => handleFlattenChange(e.currentTarget.checked)} />
                <span><strong>{t.flattenLabel}</strong> {analysis?.hasText !== false ? t.flattenHint : t.flattenHintNoText}</span>
              </label>
            )}
          </div>

          <ResultSection
            t={t}
            compare={compare}
            file={file}
            lastBlob={last?.blob ?? null}
            status={status}
            kind={kind}
            arrow={arrow}
            isDone={isDone}
            showCompare={showCompare}
            passthrough={passthrough}
            unchanged={unchanged}
            rasterBytes={rasterBytes}
            dimensions={dimensions}
            compressedSize={compressedSize}
            compareCaption={compareCaption}
            view={view}
          />
          <ResultNotes view={view} isDone={isDone} passthrough={passthrough} />
          <ResultSheet
            t={t}
            file={file}
            sheetRef={sheetRef}
            kind={kind}
            status={status}
            hasSheet={hasSheet}
            tappedBusy={tappedBusy}
            awaitingFirst={awaitingFirst}
            isDone={isDone}
            passthrough={passthrough}
            downloadUrl={downloadUrl}
            outputType={outputType}
            downloadDetail={downloadDetail}
            progress={progress}
            shareVisible={shareVisible}
            warmBuild={warmBuild}
            retry={retry}
            onDownloadClick={onDownloadClick}
            onShare={handleShare}
          />
        </div>
      ) : null}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
});
