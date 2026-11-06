// The contract for pinned notes (SEO-57): what a note is, where the approved ones live, and how long they are
// cached. Shared by `api/notes.ts`, the island and `scripts/ratings-approve.mjs`. Words appear only after Shlomi
// approved a comment a person agreed to show; anyone can post to the rating endpoint. Most ratings have no words,
// so a recent vote is a note too (SEO-58): its tool, its stars and its place, none of it free text.
import { RATING_TOOLS, MAX_COMMENT_LENGTH, type RatingTool, type Stars, STARS } from '../lib/telemetry/ratingSchema.js';

export interface PinnedNote {
  readonly tool: RatingTool;
  readonly stars: Stars;
  /** Only on an approved note. */
  readonly comment?: string;
  /** Written out by hand at approval, "Nakuru, Kenya". Never a name. */
  readonly place?: string;
  /** The country code: the flag on any note, and a vote's country name in the page's language. */
  readonly country?: string;
  /** A vote's region, by name, when it has one. */
  readonly region?: string;
}

/** Redis list of approved notes, one JSON string each, newest last. */
export const NOTES_KEY = 'rating:notes';
/** How many approved notes are read, newest first. */
export const NOTES_MAX = 12;
/** The most a response carries for one tool: what a board shows. */
export const NOTES_PER_TOOL = 4;
const MAX_PLACE_LENGTH = 60;
/** The hour: the most often the store is read, and how long a browser keeps the answer. */
export const NOTES_CACHE_SECONDS = 3600;
/** A failed read is kept briefly, so a store outage neither hammers the store nor hides notes for an hour. */
export const NOTES_FAILURE_CACHE_SECONDS = 300;
export const NOTES_PATH = '/api/notes';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Exactly an approved note's fields or a vote's, in range, or null. Used on both sides of the wire. */
export function parseNote(value: unknown): PinnedNote | null {
  if (!isObject(value)) return null;
  const { tool, stars, comment, place, country, region } = value;
  if (typeof tool !== 'string' || !(RATING_TOOLS as readonly string[]).includes(tool)) return null;
  if (!(STARS as readonly unknown[]).includes(stars)) return null;
  const hasCountry = 'country' in value;
  if (hasCountry && (typeof country !== 'string' || !/^[A-Z]{2}$/.test(country))) return null;
  if (!('comment' in value)) {
    if (!hasCountry) return null;
    const note = { tool: tool as RatingTool, stars: stars as Stars, country: country as string };
    if (Object.keys(value).length === 3) return Object.freeze(note);
    if (Object.keys(value).length !== 4 || typeof region !== 'string' || region === '' || [...region].length > MAX_PLACE_LENGTH) return null;
    return Object.freeze({ ...note, region });
  }
  if (Object.keys(value).length !== (hasCountry ? 5 : 4)) return null;
  if (typeof comment !== 'string' || comment.trim() === '' || [...comment].length > MAX_COMMENT_LENGTH) return null;
  if (typeof place !== 'string' || place.trim() === '' || [...place].length > MAX_PLACE_LENGTH) return null;
  return Object.freeze({ tool: tool as RatingTool, stars: stars as Stars, comment, place, ...(hasCountry ? { country: country as string } : {}) });
}

/** The valid notes in a `{notes: [...]}` body, anything else dropped. [] for anything unexpected. */
export function parseNotes(body: unknown): readonly PinnedNote[] {
  if (!isObject(body) || !Array.isArray(body.notes)) return [];
  return body.notes.map(parseNote).filter((n): n is PinnedNote => n !== null);
}
