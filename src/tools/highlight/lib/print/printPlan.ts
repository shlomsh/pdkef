// READ-06 print layout: where each page and each comment card sits on a printed sheet. Pure; points in, points out.
import { stackCards } from '#editor/highlight/commentCards.ts';

const NOTE_PAGE_SCALE = 0.72;
/** Between the drawn page and the notes column. */
const NOTE_GAP_PT = 12;
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

export function printPlan(pages: { width: number; height: number }[], notes: PrintNote[] | null): PagePrintPlan[] {
  return pages.map((page, index) => {
    const sheet = { width: page.width, height: page.height };
    if (!notes) return { sheet, pageScale: 1, pageBox: { x: 0, y: 0, ...sheet }, notesBox: null, cards: [] };
    const notesX = page.width * NOTE_PAGE_SCALE + NOTE_GAP_PT;
    const plan: PagePrintPlan = {
      sheet,
      pageScale: NOTE_PAGE_SCALE,
      pageBox: { x: 0, y: 0, width: page.width * NOTE_PAGE_SCALE, height: page.height * NOTE_PAGE_SCALE },
      notesBox: { x: notesX, y: 0, width: page.width - notesX, height: page.height },
      cards: [],
    };
    const mine = notes.filter((n) => n.page === index).sort((a, b) => a.anchorTop - b.anchorTop);
    if (mine.length === 0) return plan;
    const forward = stackCards(mine.map((n) => ({ id: n.id, want: n.anchorTop * NOTE_PAGE_SCALE, height: n.height })), CARD_GAP_PT);
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
