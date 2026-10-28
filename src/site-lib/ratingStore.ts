// Pure pieces of the star-rating path (SEO-46): which keys a vote lands in and how the counts are read
// back. Unlike every other count in errorReportStore.ts, a rating is permanent: one hash per tool,
// `rating:<tool>`, a count per star value, never given an expiry. Only the day's cap total expires.
import type { RatingCommentEvent, RatingEvent } from '#lib/telemetry/ratingSchema.ts';
import type { Command } from './errorReportStore.js';

/** Ratings counted per UTC day, apart from the other caps. A rating costs 1 command (2 on the day's first). */
export const RATING_DAILY_CAP = 300;

export const ratingTotalKey = (day: string) => `rating:total:${day}`;

/** First step: count the vote against the day's cap. */
export function ratingCapCommands(day: string): Command[] {
  return [['INCR', ratingTotalKey(day)]];
}

/** Second step: one count for the star value under the tool. No expiry, on purpose. */
export function ratingCommands(event: RatingEvent): Command[] {
  return [['HINCRBY', `rating:${event.properties.tool}`, String(event.properties.stars), 1]];
}

/**
 * The record of ratings and comments (SEO-48): one JSON list, newest last, trimmed to the latest entries.
 * @testSeam
 */
export const RATING_ENTRIES_KEY = 'rating:entries';
/** @testSeam */
export const RATING_ENTRIES_KEEP = 10000;

/** The country and region Vercel reports for the request; a key is absent unless its value looks right. */
export function ratingGeo(headers: { get(name: string): string | null }): { country?: string; region?: string } {
  const country = headers.get('x-vercel-ip-country');
  const region = headers.get('x-vercel-ip-country-region');
  return {
    ...(country && /^[A-Z]{2}$/.test(country) ? { country } : {}),
    ...(region && /^[A-Z0-9]{1,3}$/.test(region) ? { region } : {}),
  };
}

/** One entry per rating or comment, with the day and the geo. No expiry; LTRIM keeps the list bounded. */
export function ratingEntryCommands(
  event: RatingEvent | RatingCommentEvent,
  geo: { country?: string; region?: string },
  day: string,
): Command[] {
  const { tool, stars } = event.properties;
  const entry = {
    tool,
    stars,
    day,
    ...geo,
    ...('comment' in event.properties ? { comment: event.properties.comment } : {}),
  };
  return [
    ['RPUSH', RATING_ENTRIES_KEY, JSON.stringify(entry)],
    ['LTRIM', RATING_ENTRIES_KEY, -RATING_ENTRIES_KEEP, -1],
  ];
}

/** Build-time read: the whole hash for each tool. */
export function ratingReadCommands(tools: readonly string[]): Command[] {
  return tools.map((tool) => ['HGETALL', `rating:${tool}`]);
}

type StarCounts = Record<1 | 2 | 3 | 4 | 5, number>;

/** Parses Upstash HGETALL replies (flat [field, value, ...] strings); anything unexpected counts as zero. */
export function ratingCountsFromResults(
  tools: readonly string[],
  results: readonly { result?: unknown }[],
): Record<string, StarCounts> {
  const out: Record<string, StarCounts> = {};
  tools.forEach((tool, i) => {
    const counts: StarCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const flat = results[i]?.result;
    if (Array.isArray(flat)) {
      for (let j = 0; j + 1 < flat.length; j += 2) {
        const star = Number(flat[j]);
        const n = Number(flat[j + 1]);
        if (Number.isInteger(star) && star >= 1 && star <= 5 && Number.isSafeInteger(n) && n > 0) {
          counts[star as 1 | 2 | 3 | 4 | 5] = n;
        }
      }
    }
    out[tool] = counts;
  });
  return out;
}
