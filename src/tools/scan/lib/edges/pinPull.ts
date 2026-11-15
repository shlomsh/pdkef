/**
 * The share of the way an unpinned trace point 1, 2 and 3 points from a pin moves with it (cos squared over 4
 * points). One table for the trace (follow.ts) and the editor's live drag, so a pinned line lands where it was drawn.
 * Its own module so the editor does not load the edge follower.
 */
export const PIN_PULL: readonly number[] = [0.85, 0.5, 0.15];
