import { formatMessage } from '#lib/text/formatMessage.ts';
import type { OutputPart } from '#lib/output/usePreparedOutput.ts';
import type { BatchRow } from '../state/imageBatch.ts';

/** The set's name in the strip, the Download element and the phone bar: "12 photos". */
export function batchName(label: string, count: number): string {
  return formatMessage(label, { count });
}

/** The strip's picture of the set: the first photo that could be drawn, so a broken first file never shows. */
export function batchCover(rows: BatchRow[], thumbnails: ReadonlyMap<File, string>): File | undefined {
  return rows.find((row) => thumbnails.has(row.file))?.file;
}

/**
 * The strip's sizes for the whole set, in StripSizes' own shape. The set as one file: what was picked while
 * it works, then only what Download saves (`parts`, so a failed photo is left out of both sums).
 */
export function batchStrip(rows: BatchRow[], parts: OutputPart[], ready: boolean) {
  const before = rows.reduce((total, row) => total + (!ready || row.blob ? row.file.size : 0), 0);
  const after = parts.reduce((total, part) => total + part.blob.size, 0);
  return { before, compressedSize: after, showResult: ready, savingsPercent: before > 0 && after > 0 ? Math.round((1 - after / before) * 100) : 0 };
}
