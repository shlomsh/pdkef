// READ-06 print layout: where each page and each comment card sits on a printed sheet. Pure; points in, points out.
import { stackCards } from '#editor/highlight/commentCards.ts';

/** The sheet's margin: the page's ink starts here, and the notes column ends here. */
const SHEET_MARGIN = 24;
/** Between the page's ink and the notes column. */
const NOTE_GAP_PT = 12;
/** The notes column, as a fraction of the page width. */
const NOTES_WIDTH_FRACTION = 0.22;
const CARD_GAP_PT = 6;
export const NOTE_FONT_PT = 7.5;

export interface PrintNote {
  id: string;
  page: number;
  /** PDF points from the page top. */
  anchorTop: number;
  /** The card's measured height in points, already at print size. */
  height: number;
}

interface Box { x: number; y: number; width: number; height: number }

export interface PagePrintPlan {
  sheet: { width: number; height: number };
  pageScale: number;
  pageBox: Box;
  notesBox: Box | null;
  cards: { id: string; top: number }[];
  /** True when the cards cannot all fit the sheet's height. */
  overflow?: true;
}

/** A page in points; the ink bounds are the horizontal extent of what is printed on it (the whole width when absent). */
export interface PrintPage { width: number; height: number; inkLeft?: number; inkRight?: number }

/**
 * With notes, the page's own left margin slides off the sheet so its ink starts at the sheet margin, the page
 * shrinks only as far as the notes column needs, and the column sits 12 pt right of the ink.
 */
export function printPlan(pages: PrintPage[], notes: PrintNote[] | null): PagePrintPlan[] {
  return pages.map((page, index) => {
    const sheet = { width: page.width, height: page.height };
    if (!notes) return { sheet, pageScale: 1, pageBox: { x: 0, y: 0, ...sheet }, notesBox: null, cards: [] };
    const inkLeft = page.inkLeft ?? 0;
    const inkW = (page.inkRight ?? page.width) - inkLeft;
    const notesW = NOTES_WIDTH_FRACTION * page.width;
    const scale = Math.min(1, (page.width - 2 * SHEET_MARGIN - NOTE_GAP_PT - notesW) / inkW);
    const plan: PagePrintPlan = {
      sheet,
      pageScale: scale,
      pageBox: { x: SHEET_MARGIN - inkLeft * scale, y: 0, width: page.width * scale, height: page.height * scale },
      notesBox: { x: SHEET_MARGIN + inkW * scale + NOTE_GAP_PT, y: 0, width: notesW, height: page.height },
      cards: [],
    };
    const mine = notes.filter((n) => n.page === index).sort((a, b) => a.anchorTop - b.anchorTop);
    if (mine.length === 0) return plan;
    const forward = stackCards(mine.map((n) => ({ id: n.id, want: n.anchorTop * scale, height: n.height })), CARD_GAP_PT);
    // Reverse pass: only the cards that would run past the sheet go up.
    const pushed: number[] = [];
    let ceiling = page.height;
    for (let i = mine.length - 1; i >= 0; i--) {
      const top = Math.min(forward.get(mine[i].id) ?? 0, ceiling - mine[i].height);
      pushed[i] = top;
      ceiling = top - CARD_GAP_PT;
    }
    const fits = pushed[0] >= 0;
    const base = fits ? 0 : (forward.get(mine[0].id) ?? 0);
    plan.cards = mine.map((n, i) => ({ id: n.id, top: fits ? pushed[i] : (forward.get(n.id) ?? 0) - base }));
    if (!fits) plan.overflow = true;
    return plan;
  });
}
