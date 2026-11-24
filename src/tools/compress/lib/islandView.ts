import { formatMessage } from '#lib/text/formatMessage.ts';
import { deriveResultView, formatBytes, type ResultView } from './resultView.ts';
import type { CompressMeta } from './compressCallbacks.ts';
import { englishCompressMessages, type CompressMessages } from '../messages';

type RunStatus = 'idle' | 'processing' | 'done' | 'error';

function formatShare(share: number, lessThanOnePercent = englishCompressMessages.lessThanOnePercent): string {
  return share < 0.01 ? lessThanOnePercent : `${Math.round(share * 100)}%`;
}

/** What the strip's note line says: nothing, a bold title, or a plain sentence. */
type StripNote = { kind: 'none'; text: '' } | { kind: 'title' | 'text'; text: string };

export function stripNote(
  kind: 'pdf' | 'image' | null,
  analysis: { images: unknown[]; imageShare: number } | null,
  flatten: boolean,
  t: CompressMessages,
): StripNote {
  if (kind === 'pdf' && analysis) {
    if (analysis.images.length === 0) return { kind: 'title', text: t.noImagesTitle };
    if (!flatten) {
      return {
        kind: 'text',
        text: formatMessage(analysis.imageShare < 0.2 ? t.stripShareLowNote : t.stripShareNote, {
          share: formatShare(analysis.imageShare, t.lessThanOnePercent),
        }),
      };
    }
  }
  return { kind: 'none', text: '' };
}

export function compareCaption(kind: 'pdf' | 'image' | null, analysis: { pageCount: number } | null, t: CompressMessages): string {
  return kind === 'image' ? t.compareCaptionImage : analysis?.pageCount === 1 ? t.compareCaptionPdfSingle : t.compareCaptionPdf;
}

/** Before the first result the build is silent: Download shows the original size in its ready look. */
export function finishDetail(downloadDetail: string | undefined, file: { size: number } | null, compressedSize: number | null): string | undefined {
  return downloadDetail ?? (file && compressedSize == null ? formatBytes(file.size) : undefined);
}

/** Download is on screen from the first build on (silent, in its ready look), and Try again after a failure; a passthrough has nothing to deliver. */
export function hasFinish(hasFiles: boolean, status: RunStatus, passthrough: boolean): boolean {
  return hasFiles && status !== 'idle' && !passthrough;
}

export function showCompare(isDone: boolean, passthrough: boolean): boolean {
  return isDone && !passthrough;
}

export function runStatus(preparedStatus: string, hasLast: boolean, runnable: boolean): RunStatus {
  return preparedStatus === 'error' ? 'error' : hasLast ? 'done' : runnable ? 'processing' : 'idle';
}

/** What the specs wait on: 'done' only while the result on screen is the one the options ask for, even
 * though a stale result stays on screen silently. */
export function statusAttr(status: RunStatus, fresh: boolean): RunStatus {
  return status === 'done' && !fresh ? 'processing' : status;
}

export function analyticsStatus(batchActive: boolean, batchPhase: string, status: RunStatus, flowTap: string, retryTap: string): string {
  return (batchActive ? batchPhase : status) === 'error' ? 'error' : flowTap !== 'idle' ? flowTap : batchActive ? 'idle' : retryTap;
}

export function arrowFor(dir: 'ltr' | 'rtl'): string {
  return dir === 'rtl' ? '←' : '→';
}

interface StripSizesData { before: number; showResult: boolean; compressedSize: number | null; savingsPercent: number }

export function stripSizes(
  batch: { active: boolean; strip: StripSizesData },
  file: { size: number } | null,
  isDone: boolean,
  passthrough: boolean,
  compressedSize: number | null,
  savingsPercent: number,
): StripSizesData | null {
  return batch.active ? batch.strip : file && { before: file.size, showResult: isDone && !passthrough, compressedSize, savingsPercent };
}

export function needsPdfjs(isImageMode: boolean, batchActive: boolean): boolean {
  return !isImageMode && !batchActive;
}

export function needsUnlockMessages(t: CompressMessages) {
  return {
    title: t.protectedNeedsPasswordTitle,
    body: t.protectedNeedsPasswordBody,
    unlockIt: t.protectedUnlockIt,
    handoffFailed: t.protectedHandoffFailed,
  };
}

interface ResultViewSettings {
  t: CompressMessages;
  file: File | null;
  kind: 'pdf' | 'image' | null;
  level: string;
  targetKB: number;
  flatten: boolean;
}

/** The result view from the options on screen and the last finished run (no run yet reads as a plain success). */
export function resultViewFor(
  settings: ResultViewSettings,
  run: { isDone: boolean; compressedSize: number | null; meta: CompressMeta | null },
): ResultView {
  const { meta } = run;
  return deriveResultView({
    ...settings,
    isDone: run.isDone,
    compressedSize: run.compressedSize,
    passthrough: meta?.passthrough ?? false,
    unchanged: meta?.unchanged ?? false,
    metTarget: meta?.metTarget ?? true,
    rasterBytes: meta?.rasterBytes ?? null,
    imageReason: meta?.imageReason ?? null,
    keptBytes: meta?.keptBytes ?? 0,
    resultImageBytes: meta?.resultImageBytes ?? 0,
  });
}
