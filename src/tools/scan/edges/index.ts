import { guessByScoredRegions } from './scoredRegions.ts';
import type { EdgeGuesser } from './types.ts';

export type { EdgeGuesser } from './types.ts';
/** The current strategy (brightRegion.ts is the simpler fallback); a better detector replaces this line. */
export const guessCorners: EdgeGuesser = guessByScoredRegions;
