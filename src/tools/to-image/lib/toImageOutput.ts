import { includedPageNumbers, rotationsOf, type PlanEntry } from '../../../lib/pagePlan.ts';
import { pageNumbersToRangeString } from '../../../lib/pageSelector.js';
import type { Built } from '../../../lib/usePreparedOutput.ts';
import { type ToImageMessages } from '../messages';
import { formatMessage } from '../../../lib/formatMessage';
import { convertPdfToImages } from './toImage.js';

export type ImageFormat = 'image/png' | 'image/jpeg';
export type ImageLayout = 'separate' | 'concatenated';

/** Above this many included pages the images are not made in the background: rendering them all is
 * heavy, so it waits for the person heading for Download (hover, focus, tap). */
export const AUTO_BUILD_PAGE_LIMIT = 30;

export const autoBuilds = (includedCount: number) => includedCount <= AUTO_BUILD_PAGE_LIMIT;

/** How many images the included pages come out as. */
export const imagesMade = (includedCount: number, layout: ImageLayout) => (
  layout === 'concatenated' ? Math.min(includedCount, 1) : includedCount
);

/** The format as people write it. */
export const formatName = (format: ImageFormat) => (format === 'image/jpeg' ? 'JPG' : 'PNG');

/** The Download element's label and its Saved twin for this many images. */
export function imageLabels(
  count: number,
  format: string,
  t: Pick<ToImageMessages, 'downloadOne' | 'downloadMany' | 'imagesMany' | 'savedLabel' | 'savedMany'>,
) {
  return count <= 1
    ? { downloadLabel: formatMessage(t.downloadOne, { format }), savedLabel: t.savedLabel }
    : {
      downloadLabel: formatMessage(t.downloadMany, { count, format }),
      savedLabel: formatMessage(t.savedMany, { files: formatMessage(t.imagesMany, { count, format }) }),
    };
}

/** What the prepared output holds for a plan: one blob (one image, or the tall one) or a part per page. */
export async function buildImages(
  file: File,
  plan: PlanEntry[],
  options: { format: ImageFormat; scale: number; layout: ImageLayout },
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Built> {
  const pageNumbers = includedPageNumbers(plan);
  const images: { blob: Blob; filename: string; pageNumber: number }[] = await convertPdfToImages(file, {
    ...options,
    pages: pageNumbersToRangeString(pageNumbers),
    rotations: rotationsOf(plan),
    onProgress,
    signal,
  });
  if (images.length === 1) return { blob: images[0].blob, pageCount: pageNumbers.length };
  return { parts: images.map(({ blob, filename, pageNumber }) => ({ blob, filename, pageNumber })), pageCount: pageNumbers.length };
}
