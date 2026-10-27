// Build-time half of SEO-46: read the durable per-tool star counts once, and turn them into the
// {average, count} a tool page may show. Pure `summarize`, one guarded read in `loadRatings`.
// A build must never fail or slow down for want of the store, so every failure is "no ratings".
import { RATING_TOOLS, STARS } from '../lib/ratingSchema.js';
import { readEnv } from './errorReportStore.js';
import { ratingCountsFromResults, ratingReadCommands } from './ratingStore.js';

/**
 * A tool shows no rating, and its page carries no markup, below this many real votes.
 * @testSeam
 */
export const RATING_MIN_VOTES = 50;
const TIMEOUT_MS = 5000;

interface RatingSummary {
  average: number;
  count: number;
}
type StarCounts = Record<1 | 2 | 3 | 4 | 5, number>;

/**
 * Average to one decimal and the vote count, or null under `min` votes.
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
  return { average: Math.round((sum / count) * 10) / 10, count };
}

/**
 * Page slug -> the rating tools whose votes it shows. Unlock and Protect share one page
 * (/unlock/), so their votes are pooled; a slug not listed here (none today) gets no rating.
 */
// No @types/node in this repo; the build provides process.env.
declare const process: { env: Record<string, string | undefined> };

const RATING_TOOLS_BY_PAGE: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  RATING_TOOLS.map((t) => [t, [t]]),
);
(RATING_TOOLS_BY_PAGE as Record<string, readonly string[]>).unlock = ['unlock', 'protect'];

const emptyCounts = (): StarCounts => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });

/**
 * Summaries keyed by page slug, only for pages at or above the minimum. {} on any failure.
 * @testSeam
 */
export async function loadRatings(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, RatingSummary>> {
  const conn = readEnv(env);
  if (!conn) return {};
  try {
    const res = await fetchImpl(`${conn.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(ratingReadCommands(RATING_TOOLS)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return {};
    const results = await res.json();
    const perTool = ratingCountsFromResults(RATING_TOOLS, results);
    const out: Record<string, RatingSummary> = {};
    for (const [page, tools] of Object.entries(RATING_TOOLS_BY_PAGE)) {
      const total = emptyCounts();
      for (const t of tools) for (const s of STARS) total[s] += perTool[t]?.[s] || 0;
      const summary = summarize(total);
      if (summary) out[page] = summary;
    }
    return out;
  } catch {
    // expected: no store, no network or a slow one means a build with no ratings, never a failed build
    return {};
  }
}

let memo: Promise<Record<string, RatingSummary>> | undefined;
/** The build's one read, shared by every page. */
export function ratingForPage(slug: string): Promise<RatingSummary | null> {
  memo ??= loadRatings();
  return memo.then((r) => r[slug] ?? null);
}

/** `{average}` and `{count}` filled into a catalogue's rating line. */
export function ratingText(template: string, r: RatingSummary): string {
  return template.replace('{average}', String(r.average)).replace('{count}', String(r.count));
}
