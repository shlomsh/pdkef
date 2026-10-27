/**
 * Star ratings (SEO-46), the browser half: the once-per-device marker and the beacon.
 * Pure over an injected storage; `RatingPrompt.tsx` is the thin view on top.
 * Payload is `{tool, stars}` and nothing else, plus an optional short `comment` sent as its own event (see ratingSchema.ts).
 */
import { sendBeacon } from './errorReport.ts';
import { parseRatingCommentEvent, parseRatingEvent, type RatingTool, type Stars } from './ratingSchema.ts';

export type RatingStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** @testSeam */
export const ratedKey = (tool: RatingTool): string => `pdkef:rated:${tool}`;

/**
 * Device-wide: when any rating prompt was last shown (epoch ms).
 * @testSeam
 */
export const ASKED_AT_KEY = 'pdkef:rating-asked-at';
/** @testSeam */
export const RATING_ASK_GAP_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * True only on a device that can remember the answer, has not rated this tool, and has not been
 * shown any rating prompt in the last 14 days. A garbage asked-at value counts as absent.
 */
export function shouldAsk(storage: RatingStorage | null, tool: RatingTool, now: number): boolean {
  try {
    if (storage === null || storage.getItem(ratedKey(tool)) !== null) return false;
    const askedAt = Number(storage.getItem(ASKED_AT_KEY));
    const valid = storage.getItem(ASKED_AT_KEY) !== null && Number.isFinite(askedAt);
    return !valid || now - askedAt >= RATING_ASK_GAP_MS;
  } catch {
    // expected: blocked storage counts as already asked, so nobody is asked twice
    return false;
  }
}

/** Call when the prompt is shown: ignoring it counts as asked. */
export function markAsked(storage: RatingStorage | null, now: number): void {
  try {
    storage?.setItem(ASKED_AT_KEY, String(now));
  } catch {
    // expected: blocked storage only means the question can come back on a later visit
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

/** Hands the optional comment to `/api/report` by beacon; false when invalid (empty, too long) or not sent. Never throws. */
export function reportRatingComment(tool: RatingTool, stars: Stars, comment: string): boolean {
  try {
    const event = parseRatingCommentEvent({ name: 'tool_rating_comment', properties: { tool, stars, comment } });
    return event !== null && sendBeacon(event);
  } catch {
    // expected: a comment must never alter the tool
    return false;
  }
}
