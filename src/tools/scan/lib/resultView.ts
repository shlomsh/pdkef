import { placeImage } from '../../../lib/images/imagePage.js';
import { formatFileSize } from '../../../lib/text/format.js';
import { formatMessage } from '../../../lib/text/formatMessage';
import { pagesLabel } from '../../../shell/pageWorkspace/pageCounts.ts';
import { englishShellMessages } from '../../../shell/shellMessages';
import { englishScanMessages as t } from '../messages.ts';
import type { PageSize, Placement } from './scanPipeline.ts';
import type { PageResult, ScanPage } from '../state/scanWork.ts';

/** Fit pages print at 200 dpi (scanPipeline.ts); the same rule places a page before the build lands. */
const FIT_POINTS_PER_PIXEL = 72 / 200;

interface ResultSources {
  /** The pages of the built PDF for the current settings, once there is one. */
  shown: { pages: { url: string; place: Placement }[] } | undefined;
  /** The built PDF is ready and matches what is on screen. */
  ready: boolean;
  results: Record<number, PageResult>;
  pageSize: PageSize;
}

/** The page as it will download: the built PDF's own JPEG once it matches what is on screen,
 * otherwise this page's newest result laid on its paper by the same rule, shown as updating. */
export function resultViewFor(page: ScanPage, index: number, { shown, ready, results, pageSize }: ResultSources) {
  if (ready && shown?.pages[index]) return { src: shown.pages[index].url, place: shown.pages[index].place, exact: true };
  const result = results[page.id];
  if (!result) return { src: null, place: null, exact: false };
  return { src: result.url, place: placeImage(result.page.width, result.page.height, pageSize, FIT_POINTS_PER_PIXEL), exact: false };
}

/** The size-and-pages line under the page once the built PDF is what is shown. */
export const exactResultDetail = (size: number, pageCount: number) => (
  formatMessage(t.resultDetail, { size: formatFileSize(size), pages: pagesLabel(pageCount, englishShellMessages) })
);
