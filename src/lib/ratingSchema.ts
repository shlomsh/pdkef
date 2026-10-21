/**
 * Star ratings on the wire (SEO-46): the one schema shared by the browser that sends a rating
 * (`ratingReport.ts`) and `api/report.ts`, which files it under the tool, permanently.
 *
 * What travels is `{name: 'tool_rating', properties: {tool, stars}}`: a tool off the list below and
 * a whole number from 1 to 5. Nothing else: no comment, no file, no build, no time.
 */

// No imports, and none may be added: `api/report.ts` loads this file in the deployed function
// (see errorReportSchema.ts and functionImports.test.js). The list repeats `ANALYTICS_TOOLS`;
// a unit test keeps the two equal.
export const RATING_TOOLS = [
  'merge',
  'split',
  'edit-pdf',
  'compress',
  'compress-image',
  'pdf-to-image',
  'image-to-pdf',
  'sign',
  'redact',
  'unlock',
  'protect',
] as const;
export type RatingTool = (typeof RATING_TOOLS)[number];

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
