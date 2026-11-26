import { stackCards } from '#editor/highlight/commentCards.ts';

const GAP = 8;
const NUDGE = 6;

export type RailLayout = { tops: Map<string, number>; height: number };

/**
 * Where each rail card goes, given the measured card heights and the rail's height in px: each card level with its
 * anchor (less a small nudge), pushed below the one before it. `height` is the rail's minimum height to hold them all.
 * A card with no measured height counts as 0.
 */
export function railLayout(cards: ReadonlyArray<{ id: string; firstBand: { top: number } }>, heights: ReadonlyMap<string, number>, railHeight: number): RailLayout {
  const wanted = cards.map((card) => ({ id: card.id, want: (card.firstBand.top / 100) * railHeight - NUDGE, height: heights.get(card.id) ?? 0 }));
  const tops = stackCards(wanted, GAP);
  const last = wanted[wanted.length - 1];
  return { tops, height: last ? (tops.get(last.id) ?? 0) + last.height : 0 };
}
