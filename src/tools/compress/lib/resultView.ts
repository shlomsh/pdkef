import { isolateLtr } from '#lib/text/format.js';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { CompressMessages } from '../messages';

// Wording only: below this saving the result says so plainly. The file is still offered (COMP-01).
const SLIGHT_GAIN_PERCENT = 5;

export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface ResultViewInput {
  t: CompressMessages;
  file: File | null;
  kind: 'pdf' | 'image' | null;
  level: string;
  targetKB: number;
  flatten: boolean;
  isDone: boolean;
  compressedSize: number | null;
  passthrough: boolean;
  unchanged: boolean;
  metTarget: boolean;
  rasterBytes: number | null;
  imageReason: string | null;
  keptBytes: number;
  resultImageBytes: number;
}

export interface ResultView {
  savingsPercent: number;
  downloadDetail: string | undefined;
  resultNotice: string;
  resultTitle: string;
  slightGain: boolean;
  showFlatten: boolean;
  closestWarning: string | null;
  targetMissedNotice: string | null;
}

/** Every sentence and flag the result and its Download button derive from one finished run. */
export function deriveResultView(input: ResultViewInput): ResultView {
  const { t, file, kind, level, targetKB, flatten, isDone, compressedSize, passthrough, unchanged, metTarget, rasterBytes, imageReason, keptBytes, resultImageBytes } = input;
  // A size inside a catalogue string is bidi-isolated in right-to-left text.
  const sizeText = (bytes: number) => isolateLtr(formatBytes(bytes), t.dir);

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

  // The non-success headline of a finished run. A success has none: the strip carries the sizes.
  const resultTitle = !isDone ? ''
    : imageReason === 'encrypted' ? t.lockedTitle
      : imageReason === 'unsupported' ? t.unsupportedTitle
        : unchanged ? t.alreadySmallTitle
          : passthrough ? (kind === 'image' ? t.imageUnderTargetTitle : t.underTargetTitle)
            : slightGain ? t.slightGainTitle : '';

  // The pages-to-pictures switch is for a PDF the image path could not shrink; until then it stays out of the way.
  const imagePathFellShort = isDone && (
    imageReason === 'unsupported' || imageReason === 'no-gain' || slightGain || (level === 'target' && !metTarget)
  );
  const showFlatten = kind === 'pdf' && (flatten || imagePathFellShort);

  // The honest-miss line: worded per kind - a photo's target only ever comes from the image panel, a PDF's
  // only from Exact size, so the two conditions never overlap.
  const closestWarning = isDone && imageReason === null && missedTargetSize
    ? formatMessage(kind === 'image' ? t.imageClosestAchievable : t.closestAchievable, { size: sizeText(targetKB * 1024) })
    : null;
  const targetMissedNotice = isDone && imageReason === 'smaller' && level === 'target' && !metTarget
    ? formatMessage(t.imagesTargetMissedNotice, { size: sizeText(compressedSize as number), target: sizeText(targetKB * 1024) })
    : null;

  return { savingsPercent, downloadDetail, resultNotice, resultTitle, slightGain, showFlatten, closestWarning, targetMissedNotice };
}
