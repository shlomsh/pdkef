/**
 * Star ratings (SEO-46), the browser half: the once-per-device marker and the beacon.
 * Pure over an injected storage; `RatingPrompt.tsx` is the thin view on top.
 * Payload is `{tool, stars}` and nothing else (see ratingSchema.ts).
 */
import { sendBeacon } from './errorReport.ts';
import { parseRatingEvent, type RatingTool, type Stars } from './ratingSchema.ts';

export type RatingStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const ratedKey = (tool: RatingTool): string => `pdkef:rated:${tool}`;

/** True only on a device that can remember the answer and has not been asked about this tool. */
export function shouldAsk(storage: RatingStorage | null, tool: RatingTool): boolean {
  try {
    return storage !== null && storage.getItem(ratedKey(tool)) === null;
  } catch {
    // expected: blocked storage counts as already rated, so nobody is asked twice
    return false;
  }
}

export function markRated(storage: RatingStorage | null, tool: RatingTool): void {
  try {
    storage?.setItem(ratedKey(tool), '1');
  } catch {
    // expected: blocked storage only means the question can come back on a later visit
  }
}

/** Hands one rating to `/api/report` by beacon; false when invalid or not sent. Never throws. */
export function reportRating(tool: RatingTool, stars: Stars): boolean {
  try {
    const event = parseRatingEvent({ name: 'tool_rating', properties: { tool, stars } });
    return event !== null && sendBeacon(event);
  } catch {
    // expected: a rating must never alter the tool
    return false;
  }
}
