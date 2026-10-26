import { guessByBrightRegion } from './brightRegion.ts';
import type { EdgeGuesser } from './types.ts';

export type { EdgeGuesser } from './types.ts';
/** The current strategy; a better detector replaces this line. */
export const guessCorners: EdgeGuesser = guessByBrightRegion;
