/**
 * Star ratings on the wire (SEO-46): the one schema shared by the browser that sends a rating
 * (`ratingReport.ts`) and `api/report.ts`, which files it under the tool, permanently.
 *
 * What travels is `{name: 'tool_rating', properties: {tool, stars}}`: a tool off the list below and
 * a whole number from 1 to 5. A person may then add a few words of their own (SEO-48), sent once as
 * `{name: 'tool_rating_comment', properties: {tool, stars, comment}}`. Nothing else: no file, no build,
 * no time. The server adds the request's country and region; the browser never sends a location.
 */

// The one import is `toolIds.js` (ARCH-38), itself import-free: `api/report.ts` loads this file in the
// deployed function (see errorReportSchema.ts and functionImports.test.js), where a `.ts` specifier fails.
import { TOOL_IDS, type ToolId } from './toolIds.js';

/** The same tools as `ANALYTICS_TOOLS`: the registry's ids (src/lib/toolIds.ts). */
export const RATING_TOOLS = TOOL_IDS;
export type RatingTool = ToolId;

export const STARS = [1, 2, 3, 4, 5] as const;
export type Stars = (typeof STARS)[number];

export interface RatingEvent {
  readonly name: 'tool_rating';
  readonly properties: { readonly tool: RatingTool; readonly stars: Stars };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sameKeys = (v: object, keys: string[]) => {
  const actual = Object.keys(v).sort();
  return actual.length === keys.length && keys.every((k, i) => k === actual[i]);
};

/** Accepts exactly `{name: 'tool_rating', properties: {tool, stars}}` and nothing else. */
export function parseRatingEvent(value: unknown): RatingEvent | null {
  if (!isObject(value) || !sameKeys(value, ['name', 'properties']) || value.name !== 'tool_rating') return null;
  const p = value.properties;
  if (!isObject(p) || !sameKeys(p, ['stars', 'tool'])) return null;
  if (typeof p.tool !== 'string' || !(RATING_TOOLS as readonly string[]).includes(p.tool)) return null;
  if (!(STARS as readonly unknown[]).includes(p.stars)) return null;
  return Object.freeze({
    name: 'tool_rating' as const,
    properties: Object.freeze({ tool: p.tool as RatingTool, stars: p.stars as Stars }),
  });
}

/**
 * A comment is trimmed and kept at 1 to 500 characters (SEO-48).
 * @testSeam
 */
export const MAX_COMMENT_LENGTH = 500;
/**
 * The endpoint's body limit, MAX_REPORT_BYTES in errorReportSchema.ts (no import here; a test keeps them equal).
 * @testSeam
 */
export const REPORT_BYTE_LIMIT = 2048;

export interface RatingCommentEvent {
  readonly name: 'tool_rating_comment';
  readonly properties: { readonly tool: RatingTool; readonly stars: Stars; readonly comment: string };
}

/** Accepts exactly `{name: 'tool_rating_comment', properties: {tool, stars, comment}}`, the comment trimmed. */
export function parseRatingCommentEvent(value: unknown): RatingCommentEvent | null {
  if (!isObject(value) || !sameKeys(value, ['name', 'properties']) || value.name !== 'tool_rating_comment') return null;
  const p = value.properties;
  if (!isObject(p) || !sameKeys(p, ['comment', 'stars', 'tool']) || typeof p.comment !== 'string') return null;
  const rating = parseRatingEvent({ name: 'tool_rating', properties: { tool: p.tool, stars: p.stars } });
  const comment = p.comment.trim();
  if (!rating || comment.length === 0 || [...comment].length > MAX_COMMENT_LENGTH) return null;
  const event = Object.freeze({
    name: 'tool_rating_comment' as const,
    properties: Object.freeze({ ...rating.properties, comment }),
  });
  // A short comment can still encode past the limit (control characters take 6 bytes each); refuse it here,
  // where the browser can still tell, rather than have the endpoint drop it as oversize.
  return new TextEncoder().encode(JSON.stringify(event)).length > REPORT_BYTE_LIMIT ? null : event;
}
