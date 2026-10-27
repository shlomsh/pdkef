import type { MutableRef, Dispatch, StateUpdater } from 'preact/hooks';
import type { Built } from '../../../lib/usePreparedOutput.ts';
import { throwIfAborted } from '../../../lib/abort.js';
import { deriveFileKind } from '../../../lib/fileKind.js';
import { reportError } from '../../../lib/errorReport.ts';
import { recordAction } from '../../../lib/actionTrail.ts';
import { compressPdf, compressPdfToTarget } from './compress.js';
import { compressImageToTarget } from './compressImage.js';
import { compressedFileName as deriveDownloadName } from './outputName.ts';
import { isCurrentRun } from '../state/compressMachine.ts';
import type { useCompressMachine } from '../state/useCompressMachine.ts';
import type { CompressMessages } from '../messages';
import type { useComparePreviews } from '../hooks/useComparePreviews.ts';

/** What a finished build hands the island beside its blob, so a cached one lands exactly as a fresh one. */
export interface CompressMeta {
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
export const superseded = (): never => {
  throwIfAborted(AbortSignal.abort());
  throw new Error('unreachable');
};

interface BuildStep {
  activeFile: File;
  targetKB: number;
  level: string;
  onProgress: (fraction: number) => void;
  isCurrent: () => boolean;
  t: CompressMessages;
}

async function buildImage({ activeFile, targetKB, onProgress, isCurrent, t }: BuildStep): Promise<Built<CompressMeta>> {
  const result = await compressImageToTarget(activeFile, { targetKB, onProgress });
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

async function buildPdfImages({ activeFile, targetKB, level, onProgress, isCurrent, t }: BuildStep): Promise<Built<CompressMeta>> {
  const { compressPdfImages, compressPdfImagesToTarget, IMAGE_LEVELS } = await import('./compressImages.js');
  const result: { blob: Blob; metTarget?: boolean; reason: string; keptBytes?: number; imageBytes?: number } = level === 'target'
    ? await compressPdfImagesToTarget(activeFile, { targetKB, onProgress })
    : await compressPdfImages(activeFile, { ...IMAGE_LEVELS[level as 'high' | 'medium' | 'low'], onProgress });
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

async function buildPdfFlattened({ activeFile, targetKB, level, onProgress, isCurrent, t }: BuildStep): Promise<Built<CompressMeta>> {
  let compressedBlob: Blob;
  let didMeetTarget = true;
  let resultRasterBytes: number | null = null;
  if (level === 'target') {
    const result = await compressPdfToTarget(activeFile, { targetKB, onProgress });
    compressedBlob = result.blob;
    didMeetTarget = result.metTarget;
    resultRasterBytes = result.rasterBytes;
  } else {
    const result = await compressPdf(activeFile, { level, onProgress });
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
  const isUnchanged = isPassthrough && (level !== 'target' || !didMeetTarget);
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
}

interface CompressCallbacksInput {
  t: CompressMessages;
  machine: ReturnType<typeof useCompressMachine>;
  compare: ReturnType<typeof useComparePreviews>;
  currentFileRef: MutableRef<File | null>;
  optionsRef: MutableRef<{ level: string; targetKB: number; flatten: boolean }>;
  setAnnouncement: Dispatch<StateUpdater<string>>;
}

export interface CompressCallbacks {
  build: (signal: AbortSignal, onProgress: (fraction: number) => void) => Promise<Built<CompressMeta>>;
  fail: (err: unknown) => void;
  land: (built: Built<CompressMeta>) => void;
}

/** The build, failure and landing callbacks usePreparedOutput is handed; the island assigns them each render. */
export function createCompressCallbacks({ t, machine, compare, currentFileRef, optionsRef, setAnnouncement }: CompressCallbacksInput): CompressCallbacks {
  // One build: reads the options and the file through refs (the render that carries them may not have
  // happened yet), and touches no state but the run counter. It returns what to land.
  const build = async (signal: AbortSignal, reportProgress: (fraction: number) => void): Promise<Built<CompressMeta>> => {
    const activeFile = currentFileRef.current;
    if (!machine.read().runnable || !activeFile) throw superseded();
    const { level, targetKB, flatten } = optionsRef.current;
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

    const step: BuildStep = { activeFile, targetKB, level, onProgress, isCurrent, t };
    if (isImage) return buildImage(step);
    return flatten ? buildPdfFlattened(step) : buildPdfImages(step);
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
  return { build, fail, land };
}
