// Build-time half of SEO-46: read the durable per-tool star counts once and pool them into PDkef's one
// {average, count} (SEO-58: search results rate the app, not a tool). Pure `summarize`, one guarded read in `loadAppRating`.
// A build must never fail or slow down for want of the store, so every failure is "no ratings".
import { RATING_TOOLS, STARS } from '#lib/telemetry/ratingSchema.ts';
import { readEnv } from './errorReportStore.js';
import { countriesFromResult, entriesReadCommands, ratingCountsFromResults, ratingReadCommands } from './ratingStore.js';

/**
 * No page shows a rating or carries markup below this many real votes, across all tools together.
 * @testSeam
 */
export const RATING_MIN_VOTES = 10;
const TIMEOUT_MS = 5000;

interface RatingSummary {
  average: number;
  count: number;
}
interface AppRating extends RatingSummary {
  countries: number;
}
type StarCounts = Record<1 | 2 | 3 | 4 | 5, number>;

/**
 * Average to two decimals and the vote count, or null under `min` votes.
 * @testSeam
 */
export function summarize(counts: StarCounts, min: number = RATING_MIN_VOTES): RatingSummary | null {
  let count = 0;
  let sum = 0;
  for (const s of STARS) {
    const n = counts[s] || 0;
    count += n;
    sum += n * s;
  }
  if (count < min || count === 0) return null;
  return { average: Math.round((sum / count) * 100) / 100, count };
}

// No @types/node in this repo; the build provides process.env.
declare const process: { env: Record<string, string | undefined> };

const emptyCounts = (): StarCounts => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });

/**
 * Every tool's votes as one rating, or null under the minimum or on any failure.
 * @testSeam
 */
export async function loadAppRating(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<AppRating | null> {
  const conn = readEnv(env);
  if (!conn) return null;
  try {
    const res = await fetchImpl(`${conn.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([...ratingReadCommands(RATING_TOOLS), ...entriesReadCommands()]),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const results = await res.json();
    const perTool = ratingCountsFromResults(RATING_TOOLS, results);
    const total = emptyCounts();
    for (const t of RATING_TOOLS) for (const s of STARS) total[s] += perTool[t]?.[s] || 0;
    const summary = summarize(total);
    return summary && { ...summary, countries: countriesFromResult(results[RATING_TOOLS.length]) };
  } catch {
    // expected: no store, no network or a slow one means a build with no rating, never a failed build
    return null;
  }
}

let memo: Promise<AppRating | null> | undefined;
/** The build's one read, shared by every page. */
export function appRating(): Promise<AppRating | null> {
  memo ??= loadAppRating();
  return memo;
}

/** `{average}`, `{count}` and `{countries}` filled into a catalogue's rating line. */
export function ratingText(template: string, r: RatingSummary & { countries?: number }): string {
  return template
    .replace('{average}', String(r.average))
    .replace('{count}', String(r.count))
    .replace('{countries}', String(r.countries ?? ''));
}
