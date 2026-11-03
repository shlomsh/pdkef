import { placeImage } from '#lib/images/imagePage.js';
import { formatFileSize } from '#lib/text/format.js';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { pagesLabel } from '#shell/pageWorkspace/pageCounts.ts';
import { englishShellMessages } from '#shell/shellMessages.ts';
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

/** A table tile is a 3:4 box; the paper sits inside it with a little room all round. */
const TILE_ASPECT = 3 / 4;
const PAPER_FILL = 0.88;

/** A page's thumbnail on its paper for the table's tile, by the same placement rule as the viewer:
 * on A4 a wide or narrow scan shows its margins, on Fit it fills the paper. Null before the first result. */
export function tilePaper(page: ScanPage, results: Record<number, PageResult>, pageSize: PageSize): { src: string; place: Placement } | null {
  const result = results[page.id];
  if (!result) return null;
  return { src: result.thumbUrl, place: placeImage(result.page.width, result.page.height, pageSize, FIT_POINTS_PER_PIXEL) };
}

/** The paper's box inside the 3:4 tile, as percentages of the tile: the long side fills, the other follows the paper's shape. */
export function paperFit({ pageWidth, pageHeight }: Pick<Placement, 'pageWidth' | 'pageHeight'>): { widthPct: number; heightPct: number } {
  const aspect = pageWidth / pageHeight;
  if (aspect <= TILE_ASPECT) return { widthPct: (PAPER_FILL * 100 * aspect) / TILE_ASPECT, heightPct: PAPER_FILL * 100 };
  return { widthPct: PAPER_FILL * 100, heightPct: (PAPER_FILL * 100 * TILE_ASPECT) / aspect };
}
