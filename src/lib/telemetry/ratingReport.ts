/**
 * Star ratings (SEO-46), the browser half: the once-per-device marker and the beacon.
 * Pure over an injected storage; `RatingPrompt.tsx` is the thin view on top.
 * Payload is `{tool, stars}` and nothing else, plus an optional short `comment` sent as its own event (see ratingSchema.ts).
 */
import { sendBeacon } from './errorReport.ts';
import { parseRatingCommentEvent, parseRatingEvent, RATING_TOOLS, type RatingTool, type Stars } from './ratingSchema.ts';

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
 * The stars this device gave, app-wide (one rating, not one per tool).
 * @testSeam
 */
export const MY_STARS_KEY = 'pdkef:my-stars';

/** True once this device rated anything: the stars key, or a legacy per-tool marker. Blocked storage is false. */
export function hasRated(storage: RatingStorage | null): boolean {
  try {
    if (storage === null) return false;
    return storage.getItem(MY_STARS_KEY) !== null || RATING_TOOLS.some((t) => storage.getItem(ratedKey(t)) !== null);
  } catch {
    // expected: blocked storage has nothing to read
    return false;
  }
}

/** The stars this device gave, or null when unknown (legacy marker only, garbage, blocked storage). */
export function ownStars(storage: RatingStorage | null): Stars | null {
  try {
    const n = Number(storage?.getItem(MY_STARS_KEY));
    return Number.isInteger(n) && n >= 1 && n <= 5 ? (n as Stars) : null;
  } catch {
    // expected: blocked storage has nothing to read
    return null;
  }
}

/**
 * True only on a device that can remember the answer, has never rated (any tool), and has not been
 * shown any rating prompt in the last 14 days. A garbage asked-at value counts as absent.
 */
export function shouldAsk(storage: RatingStorage | null, _tool: RatingTool, now: number): boolean {
  try {
    if (storage === null || hasRated(storage)) return false;
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

export function markRated(storage: RatingStorage | null, tool: RatingTool, stars: Stars): void {
  try {
    storage?.setItem(ratedKey(tool), '1');
    storage?.setItem(MY_STARS_KEY, String(stars));
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

/** Hands the optional comment to `/api/report` by beacon; false when invalid (empty, too long) or not sent. Never throws. `share` is the person's OK to show it. */
export function reportRatingComment(tool: RatingTool, stars: Stars, comment: string, share = false): boolean {
  try {
    const event = parseRatingCommentEvent({ name: 'tool_rating_comment', properties: { tool, stars, comment, ...(share ? { share } : {}) } });
    return event !== null && sendBeacon(event);
  } catch {
    // expected: a comment must never alter the tool
    return false;
  }
}
