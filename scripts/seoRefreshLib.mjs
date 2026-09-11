// LOC-06: the pure logic behind scripts/seo-refresh.mjs's per-locale section,
// factored out so src/lib/seoRefresh.test.js can exercise it under vitest
// against small inline fixtures - the same "test a scripts/ module from
// src/lib/" pattern src/lib/backlog.test.js uses for scripts/backlog-data.mjs.
// seo-refresh.mjs imports everything here rather than redefining it; this
// file has no CLI entry point of its own and does nothing when imported.
import { LOCALIZED_PATH_PREFIXES, PILOT_COUNTRY_BY_PREFIX } from '../src/i18n/localePrefixes.js';

// These exports never quote fields (no commas inside values), so a plain
// split is safe and avoids pulling in a CSV parser dependency. Moved here
// unchanged from the original seo-refresh.mjs (SEO-02).
export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    header.forEach((key, i) => {
      row[key] = cells[i];
    });
    return row;
  });
}

export function weightedPosition(rows) {
  const impressions = rows.reduce((sum, r) => sum + Number(r.Impressions), 0);
  if (impressions === 0) return null;
  const weighted = rows.reduce((sum, r) => sum + Number(r.Position) * Number(r.Impressions), 0);
  return weighted / impressions;
}

// Script detection, in match-priority order. A query is classified by the
// first non-Latin script it contains - almost every Hebrew query here also
// contains the Latin word "PDF", and a query mixing scripts is exactly the
// kind of row that used to vanish into the English-intent clusters (or the
// unclassified list) in seo-refresh.mjs's original CLUSTER_PATTERNS. Latin
// is checked last on purpose, not because it is rare: a query with no
// non-Latin character at all is genuinely Latin-only and excluded from the
// per-script grouping below (it already has a home in the intent clusters).
const SCRIPT_TESTS = [
  ['Hebrew', /\p{Script=Hebrew}/u],
  ['Arabic', /\p{Script=Arabic}/u],
  ['Devanagari', /\p{Script=Devanagari}/u],
  ['Bengali', /\p{Script=Bengali}/u],
  ['Tamil', /\p{Script=Tamil}/u],
  ['Telugu', /\p{Script=Telugu}/u],
  ['Thai', /\p{Script=Thai}/u],
  ['CJK', /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u],
  ['Latin', /\p{Script=Latin}/u],
];

/** The first script (in SCRIPT_TESTS order) a query contains, or 'Other' for a query with none of them (pure digits/punctuation, or a script not yet listed here). */
export function detectScript(query) {
  for (const [name, pattern] of SCRIPT_TESTS) {
    if (pattern.test(query ?? '')) return name;
  }
  return 'Other';
}

/**
 * Every query in Queries.csv that carries a non-Latin script, grouped by
 * that script, each as its own visible cluster with the raw query strings -
 * the direct fix for LOC-06's problem statement: a Hebrew query matches none
 * of seo-refresh.mjs's English-intent CLUSTER_PATTERNS today, so it is
 * invisible in the by-intent table even though Pages.csv shows the page it
 * landed on. Rows within a script are sorted by impressions, highest first,
 * so the phrasing LOC-01 predicted is easiest to check against what
 * actually arrived. Latin-only queries are excluded; they already have a
 * home in the by-intent clusters.
 */
export function groupQueriesByScript(queries) {
  const byScript = new Map();
  for (const row of queries) {
    const script = detectScript(row['Top queries']);
    if (script === 'Latin') continue;
    if (!byScript.has(script)) byScript.set(script, []);
    byScript.get(script).push(row);
  }
  return [...byScript.entries()]
    .map(([script, rows]) => {
      const sorted = rows.slice().sort((a, b) => Number(b.Impressions) - Number(a.Impressions));
      return {
        script,
        rows: sorted,
        clicks: rows.reduce((s, r) => s + Number(r.Clicks), 0),
        impressions: rows.reduce((s, r) => s + Number(r.Impressions), 0),
        weightedPosition: weightedPosition(rows),
      };
    })
    .sort((a, b) => b.impressions - a.impressions);
}

const SITE_ORIGIN_PATTERN = /^https?:\/\/[^/]+/;

/** A Search Console "Top pages" URL as a root-relative path, trailing slash included, never empty. */
export function normalizePagePath(url) {
  const path = (url ?? '').replace(SITE_ORIGIN_PATTERN, '');
  return path || '/';
}

/**
 * Splits a normalized path into its locale prefix and the English sibling's
 * path, or null if the path isn't under a locale prefix at all. Mirrors
 * isLocalizedPath's own rule (a bare `/he/` is the not-yet-built Hebrew home
 * page, not a page with an English sibling, so it is excluded the same way).
 */
function localeSplit(path) {
  const segments = path.replace(/^\//, '').split('/').filter(Boolean);
  const [first, ...rest] = segments;
  if (!first || !LOCALIZED_PATH_PREFIXES.includes(first) || rest.length === 0) return null;
  return { prefix: first, siblingPath: `/${rest.join('/')}/` };
}

/**
 * Pages.csv grouped by locale prefix, each localized page carrying its
 * English sibling's own numbers alongside it (same path, prefix removed) so
 * the two can be read side by side - LOC-06's second requirement. A
 * localized page whose English sibling did not appear in this export (zero
 * impressions, or genuinely no English page at that path, e.g. a guide with
 * no English original) gets `sibling: null` rather than a row of zeros, so
 * the two cases print differently. Locales are returned in
 * LOCALIZED_PATH_PREFIXES order, not discovery order, so the section is
 * stable across refreshes as more locales ship; a locale with no rows this
 * period is simply absent, not printed empty.
 */
export function groupPagesByLocale(pages) {
  const englishByPath = new Map();
  const localizedRows = [];
  for (const row of pages) {
    const path = normalizePagePath(row['Top pages']);
    const split = localeSplit(path);
    if (split) {
      localizedRows.push({ ...split, path, row });
    } else {
      englishByPath.set(path, row);
    }
  }

  const toEntry = (row) => ({
    clicks: Number(row.Clicks),
    impressions: Number(row.Impressions),
    ctr: row.CTR,
    position: Number(row.Position),
  });

  const byPrefix = new Map();
  for (const { prefix, path, siblingPath, row } of localizedRows) {
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    const englishRow = englishByPath.get(siblingPath);
    byPrefix.get(prefix).push({
      path,
      siblingPath,
      ...toEntry(row),
      sibling: englishRow ? { path: siblingPath, ...toEntry(englishRow) } : null,
    });
  }

  return LOCALIZED_PATH_PREFIXES.filter((prefix) => byPrefix.has(prefix)).map((prefix) => ({
    prefix,
    pilotCountry: PILOT_COUNTRY_BY_PREFIX[prefix] ?? null,
    pages: byPrefix.get(prefix).sort((a, b) => b.impressions - a.impressions),
  }));
}

/**
 * The Countries.csv row for a locale's pilot country (PILOT_COUNTRY_BY_PREFIX),
 * or null if this locale has no pilot country on record. `row` is null (not
 * a zeroed object) when the country doesn't appear in this export at all -
 * either genuinely zero, or below whatever threshold Search Console applies -
 * so the caller can print that distinction rather than a false zero.
 */
export function countryRowForLocale(countries, prefix) {
  const country = PILOT_COUNTRY_BY_PREFIX[prefix];
  if (!country) return null;
  const row = (countries ?? []).find((r) => r.Country === country) ?? null;
  return { country, row };
}
