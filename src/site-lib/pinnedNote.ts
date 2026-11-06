// The contract for pinned notes (SEO-57): what a note is, where the approved ones live, and how long they are
// cached. Shared by `api/notes.ts`, the island and `scripts/ratings-approve.mjs`. A note exists only after
// Shlomi approved a comment a person agreed to show; anyone can post to the rating endpoint, so nothing else is served.
import { RATING_TOOLS, MAX_COMMENT_LENGTH, type RatingTool, type Stars, STARS } from '../lib/telemetry/ratingSchema.js';

export interface PinnedNote {
  readonly tool: RatingTool;
  readonly stars: Stars;
  readonly comment: string;
  /** Written out by hand at approval, "Nakuru, Kenya". Never a name. */
  readonly place: string;
}

/** Redis list of approved notes, one JSON string each, newest last. */
export const NOTES_KEY = 'rating:notes';
/** The most a response carries. */
export const NOTES_MAX = 12;
const MAX_PLACE_LENGTH = 60;
/** The hour: the most often the store is read, and how long a browser keeps the answer. */
export const NOTES_CACHE_SECONDS = 3600;
/** A failed read is kept briefly, so a store outage neither hammers the store nor hides notes for an hour. */
export const NOTES_FAILURE_CACHE_SECONDS = 300;
export const NOTES_PATH = '/api/notes';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Exactly the four fields, in range, or null. Used on both sides of the wire. */
export function parseNote(value: unknown): PinnedNote | null {
  if (!isObject(value) || Object.keys(value).length !== 4) return null;
  const { tool, stars, comment, place } = value;
  if (typeof tool !== 'string' || !(RATING_TOOLS as readonly string[]).includes(tool)) return null;
  if (!(STARS as readonly unknown[]).includes(stars)) return null;
  if (typeof comment !== 'string' || comment.trim() === '' || [...comment].length > MAX_COMMENT_LENGTH) return null;
  if (typeof place !== 'string' || place.trim() === '' || [...place].length > MAX_PLACE_LENGTH) return null;
  return Object.freeze({ tool: tool as RatingTool, stars: stars as Stars, comment, place });
}

/** The valid notes in a `{notes: [...]}` body, anything else dropped. [] for anything unexpected. */
export function parseNotes(body: unknown): readonly PinnedNote[] {
  if (!isObject(body) || !Array.isArray(body.notes)) return [];
  return body.notes.map(parseNote).filter((n): n is PinnedNote => n !== null);
}
