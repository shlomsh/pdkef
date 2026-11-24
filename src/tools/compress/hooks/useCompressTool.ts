import { useRef, useState } from 'preact/hooks';
import type { QuietPolicy } from '#lib/output/quietPrepare.ts';
import { usePreparedOutput } from '#lib/output/usePreparedOutput.ts';
import { useLatestRun } from '#lib/hooks/useLatestRun.ts';
import { deriveFileKind } from '#lib/handoff/fileKind.js';
import { type Level } from '../components/LevelPicker.tsx';
import { useComparePreviews } from './useComparePreviews.ts';
import { compressHandoffItems } from '../lib/handoffs.ts';
import { useLastResult } from './useLastResult.ts';
import { useHoldUpdate } from '#lib/hooks/useHoldUpdate.ts';
import { englishCompressMessages, type CompressMessages } from '../messages';
import { type ShellMessages } from '#shell/shellMessages.ts';
import { type AnalyticsTool } from '#lib/telemetry/productAnalytics.ts';
import { useCompressMachine } from '../state/useCompressMachine.ts';
import { createCompressCallbacks, superseded, type CompressCallbacks, type CompressMeta } from '../lib/compressCallbacks.ts';
import { useFileIntake, type PdfAnalysis } from './useFileIntake.ts';
import { useRunActions } from './useRunActions.ts';
import { buildKey } from '../lib/buildKey.ts';
import { arrowFor, finishDetail, hasFinish, resultViewFor, runStatus, stripNote, stripSizes } from '../lib/islandView.ts';
import { useCompressFinish } from './useCompressFinish.ts';

const TARGET_SIZE_PRESETS_KB = [100, 200, 500, 1000];
// Starts lower than the PDF presets above: the image half of this tool's demand
// is the photo half of application portals, which commonly cap a photo at
// 20-50KB, tighter than the document limits the PDF presets target. Four, so
// they fit one row beside the KB field. 500KB came back in place of 20KB
// (Shlomi, 2026-11-03, trying a set of photos and scans for a portal upload);
// 20KB or any other size can still be typed.
export const IMAGE_TARGET_SIZE_PRESETS_KB = [50, 100, 200, 500];

export interface PdfCompressToolProps {
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
  /** COMP-04: the picker selects several photos at once (/compress-image/). A drop of several works on every page. */
  pickMany?: boolean;
}

export function useCompressTool({
  messages: messagesProp,
  analyticsTool = 'compress',
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
  const { runnable, runCount, retryTap } = machine.state;
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
  const dimensions = meta?.dimensions ?? null;
  const rasterBytes = meta?.rasterBytes ?? null;
  // True when either compressor's passthrough rule fired (the file was already under target, so the
  // "compressed" blob is literally the input File). The notice paragraph replaces the re-encode
  // warning with an honest "untouched" one, and no download is offered.
  const passthrough = meta?.passthrough ?? false;
  // A PDF passthrough that is not the "already under target" kind: re-rendering it would only have
  // made it bigger, so the input is handed back as it is.
  const unchanged = meta?.unchanged ?? false;
  const status = runStatus(prepared.status, !!last, runnable); // idle | processing | done | error
  useHoldUpdate(status === 'processing');
  useHoldUpdate(file !== null, 'open');

  const kind = deriveFileKind(file);
  // An image has only Exact size, so it gets the size field instead of the level picker.
  const isImageMode = kind === 'image';
  const targetSizePresets = isImageMode ? IMAGE_TARGET_SIZE_PRESETS_KB : TARGET_SIZE_PRESETS_KB;

  // COMP-04: `batch` is two or more photos, compressed one after another to one target.
  const { flow, batch, batchName } = useCompressFinish({
    t, kind, prepared: { ...prepared, passthrough: !!prepared.meta?.passthrough }, fileName: meta?.filename ?? '', setAnnouncement, analyticsTool,
  });

  const { handleFilesAdded } = useFileIntake({
    t, machine, compare, flow, encryptionCheck, file, fileSeq, runnable, preparedStatus: prepared.status,
    prepareNow: prepared.prepareNow, forgetLast, currentFileRef,
    setFile, setFileSeq, setRejectedFiles, setAnnouncement, setNeedsUnlockBytes, setAnalysis,
    batch, targetKB,
  });

  callbacksRef.current = createCompressCallbacks({ t, machine, compare, currentFileRef, optionsRef, setAnnouncement });

  const { warmBuild, handleLevelChange, handleFlattenChange, handleTargetKBChange, retry } = useRunActions({
    analyticsTool, machine, compare, flow, prepared, fresh, passthrough, retryTap,
    level, targetKB, flatten, setLevel, setTargetKB, setFlatten,
  });

  const hasFiles = !!file || batch.active;
  const isDone = hasFiles && status === 'done';
  const view = resultViewFor({ t, file, kind, level, targetKB, flatten }, { isDone, compressedSize, meta });
  const { savingsPercent, downloadDetail } = view;

  // Download is on screen from the first build on (silent, in its ready look), and Try again after a failure;
  // a passthrough has nothing to deliver.
  const finishShown = hasFinish(hasFiles, status, passthrough);
  const handoffs = compressHandoffItems(kind, t);
  const detail = finishDetail(downloadDetail, file, compressedSize);

  // What the strip's note line says about the PDF; the strip reserves its height whatever arrives.
  const note = stripNote(kind, analysis, flatten, t);
  const arrow = arrowFor(t.dir);
  // A photo never has a strip note, so the strip reserves no lines for one.

  const sizes = stripSizes(batch, file, isDone, passthrough, compressedSize, savingsPercent);

  return {
    t, analyticsTool, machine, compare, prepared, last, flow, batch, batchName, handleFilesAdded,
    actions: { warmBuild, handleLevelChange, handleFlattenChange, handleTargetKBChange, retry },
    file, level, targetKB, flatten, rejectedFiles, announcement, needsUnlockBytes, analysis,
    runnable, runCount, retryTap, fresh, meta, passthrough, unchanged, dimensions, rasterBytes, compressedSize,
    status, kind, isImageMode, targetSizePresets, hasFiles, isDone, view, finishShown, handoffs, detail, note, arrow, sizes,
  };
}
