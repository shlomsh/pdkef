/**
 * RED-38: "Cover all" pressed while the text is still being read is queued
 * and delivered once every page has been read, so it never covers only the
 * pages seen so far. Pure: the bar feeds it what it sees on each render.
 */
export interface CoverAllQueueInput {
  queued: boolean;
  /** True while pages are still being read. */
  reading: boolean;
  failed: boolean;
  /** Matches not yet under a box, across the pages read so far. */
  open: number;
}

/** What a queued Cover all should do now: wait for more pages, deliver, or drop. */
export type CoverAllQueueStep = 'idle' | 'wait' | 'deliver' | 'drop';

export function coverAllQueueStep({ queued, reading, failed, open }: CoverAllQueueInput): CoverAllQueueStep {
  if (!queued) return 'idle';
  if (failed) return 'drop';
  if (reading) return 'wait';
  return open > 0 ? 'deliver' : 'drop';
}
