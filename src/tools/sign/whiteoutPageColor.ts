import { sampleRingColor } from '../../editor-ui/whiteout/pageSampling.ts';
import type { PercentBox } from '../../editor-ui/whiteout/pageColor.ts';

/** The attribute PdfWorkspace puts on each page's wrapper: the page index as its value. */
export const SIGN_PAGE_SURFACE = 'data-sign-page-surface';

/** The rendered PDF canvas of a page, found through the DOM; null when that page is not mounted. */
export function signPageCanvas(pageIndex: number): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>(`[${SIGN_PAGE_SURFACE}="${pageIndex}"] canvas`);
}

/** The page colour just outside a percent box ('#rrggbb'), or null when it cannot be read. */
export function samplePageColor(pageIndex: number, box: PercentBox): string | null {
  return sampleRingColor(signPageCanvas(pageIndex), box);
}
