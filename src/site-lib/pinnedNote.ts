// The contract for pinned notes (SEO-57): what a note is and where the approved ones live. Read once per build
// (`notesAtBuild.ts`), shown by the island, written by `scripts/ratings-approve.mjs`. Words appear only after Shlomi
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
  /** The UTC day of the vote, YYYY-MM-DD, shown as the note's date. */
  readonly day?: string;
}

/** Redis list of approved notes, one JSON string each, newest last. */
export const NOTES_KEY = 'rating:notes';
/** How many approved notes are read, newest first. */
export const NOTES_MAX = 12;
/** What a board shows, three by three, and so the most one tool carries. */
export const NOTES_PER_TOOL = 9;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PLACE_LENGTH = 60;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Exactly an approved note's fields or a vote's, in range, with an optional day, or null. Used on both sides of the wire. */
export function parseNote(value: unknown): PinnedNote | null {
  if (!isObject(value)) return null;
  const { day, ...rest } = value;
  if (!('day' in value)) return parseUndated(rest);
  if (typeof day !== 'string' || !DAY.test(day)) return null;
  const note = parseUndated(rest);
  return note && Object.freeze({ ...note, day });
}

function parseUndated(value: Record<string, unknown>): PinnedNote | null {
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

/** The notes for that tool, or all when no tool; they arrive newest first. */
export function notesToShow(notes: readonly PinnedNote[], tool?: RatingTool): readonly PinnedNote[] {
  return (tool ? notes.filter((n) => n.tool === tool) : notes).slice(0, NOTES_PER_TOOL);
}
