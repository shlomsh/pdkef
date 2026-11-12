import { imagesToPdf, UnreadableImageError } from '#lib/images/imagesToPdf.js';
import { reportError } from '#lib/telemetry/errorReport.ts';

/**
 * The PDF for the pictures in their current order. A picture neither pdf-lib nor the browser can
 * decode is left out (DEBT-75): its name goes to `onUnreadable`, and `pageCount` counts what was kept.
 */
export async function buildImagesPdf(
  files: File[],
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
  onUnreadable: (names: string[]) => void,
): Promise<{ blob: Blob; pageCount: number }> {
  const unreadable: string[] = [];
  const blob = await imagesToPdf(files, onProgress, signal, { onSkip: (name: string) => unreadable.push(name) });
  if (!signal.aborted) onUnreadable(unreadable);
  return { blob, pageCount: files.length - unreadable.length };
}

/** A build failure is reported, except a picture nothing can decode: that is the person's file. */
export function reportBuildError(err: unknown): void {
  if (!(err instanceof UnreadableImageError)) reportError('pdf_tool_run', err, 'build_pdf_from_images');
}

/**
 * The names the "skipped" note speaks of: files refused at intake (not a JPG or PNG) and pictures
 * the build left out because nothing could decode them. A left-out picture the person has since
 * removed from the list is no longer named.
 */
export function skippedNames(rejected: string[], unreadable: string[], entries: { file: { name: string } }[]): string[] {
  return [...rejected, ...unreadable.filter((name) => entries.some((entry) => entry.file.name === name))];
}
