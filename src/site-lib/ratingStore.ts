// Pure pieces of the star-rating path (SEO-46): which keys a vote lands in and how the counts are read
// back. Unlike every other count in errorReportStore.ts, a rating is permanent: one hash per tool,
// `rating:<tool>`, a count per star value, never given an expiry. Only the day's cap total expires.
import type { RatingCommentEvent, RatingEvent } from '../lib/telemetry/ratingSchema.js';
import type { Command } from './errorReportStore.js';
import { NOTES_KEY, NOTES_MAX, NOTES_PER_TOOL, parseNote, type PinnedNote } from './pinnedNote.js';

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
    ...('share' in event.properties ? { share: true } : {}),
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

/** Build-time read of the record, for the country count. Bounded by RATING_ENTRIES_KEEP. */
export function entriesReadCommands(): Command[] {
  return [['LRANGE', RATING_ENTRIES_KEY, 0, -1]];
}

/** How many different countries the record names. Only ever published as this one number. */
export function countriesFromResult(reply: { result?: unknown } | undefined): number {
  const rows = Array.isArray(reply?.result) ? reply.result : [];
  const countries = new Set<string>();
  for (const row of rows) {
    try {
      const country = JSON.parse(String(row))?.country;
      if (typeof country === 'string') countries.add(country);
    } catch {
      // expected: an unreadable row counts for nothing
    }
  }
  return countries.size;
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

/** How far back to look for votes to show: enough for variety, small enough for one hourly read. */
const RECENT_VOTES = 200;

/** One read for the approved notes and the recent record. */
export function notesReadCommands(): Command[] {
  return [['LRANGE', NOTES_KEY, -NOTES_MAX, -1], ['LRANGE', RATING_ENTRIES_KEY, -RECENT_VOTES, -1]];
}

const jsonRows = (reply: { result?: unknown } | undefined): unknown[] => {
  const rows: unknown[] = [];
  for (const raw of Array.isArray(reply?.result) ? reply.result : []) {
    if (typeof raw !== 'string') continue;
    try {
      rows.push(JSON.parse(raw));
    } catch {
      // expected: a stored row that is not JSON is dropped
    }
  }
  return rows;
};

const isDayless = (row: unknown) => typeof row === 'object' && row !== null && !('day' in row);

type RegionName = (country: string, region: string) => string | undefined;

/** Recent votes as notes, newest first: never a comment, and one per tool and country, for variety. */
function voteNotes(reply: { result?: unknown } | undefined, regionName: RegionName, taken: Iterable<string>): readonly PinnedNote[] {
  const seen = new Set<string>(taken);
  const notes: PinnedNote[] = [];
  for (const row of jsonRows(reply).reverse()) {
    const { tool, stars, country, region, comment, day } = (row ?? {}) as Record<string, unknown>;
    if (comment !== undefined) continue;
    const name = typeof country === 'string' && typeof region === 'string' ? regionName(country, region) : undefined;
    const note = parseNote({ tool, stars, country, ...(name ? { region: name } : {}), ...(day === undefined ? {} : { day }) });
    const key = `${tool}:${country}`;
    if (!note || seen.has(key)) continue;
    seen.add(key);
    notes.push(note);
  }
  return notes;
}

/** The first NOTES_PER_TOOL of each tool, words first, then one from each tool in turn, so no tool fills the board. */
function spread(notes: readonly PinnedNote[]): readonly PinnedNote[] {
  const seen = new Map<string, number>();
  const ranked = notes.map((note) => {
    const rank = seen.get(note.tool) ?? 0;
    seen.set(note.tool, rank + 1);
    return { note, rank };
  });
  return ranked
    .filter(({ rank }) => rank < NOTES_PER_TOOL)
    .sort((a, b) => Number(!a.note.comment) - Number(!b.note.comment) || a.rank - b.rank)
    .map(({ note }) => note);
}

/** Approved notes, newest first, then recent votes, spread across the tools. Invalid rows are dropped. */
export function notesFromResults(
  approved: { result?: unknown } | undefined,
  entries: { result?: unknown } | undefined,
  regionName: RegionName,
): readonly PinnedNote[] {
  const commentDays = new Map<unknown, unknown>();
  for (const row of jsonRows(entries)) {
    const { comment, day } = (row ?? {}) as Record<string, unknown>;
    if (typeof comment === 'string') commentDays.set(comment, day);
  }
  // A note approved before notes carried a day takes its comment's day from the record.
  const dated = (row: unknown) => {
    const { comment } = (row ?? {}) as Record<string, unknown>;
    return isDayless(row) && commentDays.has(comment) ? { ...(row as object), day: commentDays.get(comment) } : row;
  };
  const words = jsonRows(approved).map(dated).map(parseNote).filter((n): n is PinnedNote => n !== null);
  const shown = words.slice(-NOTES_MAX).reverse();
  // A person whose words are pinned is not pinned again by their vote.
  const taken = shown.map((n) => `${n.tool}:${n.country}`);
  return spread([...shown, ...voteNotes(entries, regionName, taken)]);
}
