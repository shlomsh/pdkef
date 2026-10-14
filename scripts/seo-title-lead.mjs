// Pure helpers for seo-crawl-staleness.mjs: did a page's <title> or <h1> change its
// leading phrase since Google last crawled it?
//
// Why. SEO-35 rewrote /merge/'s title from "Merge PDF Online Free - ..." to "Merge or
// Combine PDF Files Online Free - ...". An indexing request on 2026-10-08 made Google read
// it, and the page went from about 1.5K impressions a week to 15 in three days (SEO-45).
// /compress/ and /split/ were recrawled the same days with only their title tails changed,
// and held. The lead is what a query is matched against; the tail is decoration. So an
// indexing request after a lead change is a deliberate act, not a routine one.

const SEPARATOR = / - |:|\|/;

// The text before the first " - ", ":" or "|", lowercased with spacing collapsed.
export function leadingPhrase(text) {
  const [lead] = String(text).split(SEPARATOR);
  return lead.trim().replace(/\s+/g, ' ').toLowerCase();
}

const norm = (text) => String(text).trim().replace(/\s+/g, ' ').toLowerCase();

// 'unchanged' | 'tail changed' | 'LEAD CHANGED' | 'no history' (a side is missing).
export function classifyChange(before, after) {
  if (!before || !after) return 'no history';
  if (norm(before) === norm(after)) return 'unchanged';
  return leadingPhrase(before) === leadingPhrase(after) ? 'tail changed' : 'LEAD CHANGED';
}

const RANK = { 'no history': 0, unchanged: 1, 'tail changed': 2, 'LEAD CHANGED': 3 };

// Per-field states plus the worst of them. `before` is null when the page did not exist yet.
export function classifyPage(before, after) {
  const seoTitle = classifyChange(before?.seoTitle, after?.seoTitle);
  const h1 = classifyChange(before?.h1, after?.h1);
  const state = seoTitle === 'no history' && h1 === 'no history'
    ? 'no history'
    : [seoTitle, h1].reduce((worst, s) => (RANK[s] > RANK[worst] ? s : worst), 'unchanged');
  return { state, seoTitle, h1 };
}

// A single-quoted scalar: JS escapes a quote as \', YAML as ''.
function unquote(raw) {
  return raw.slice(1, -1).replace(/\\'/g, "'").replace(/''/g, "'");
}

const FIELD = (key) => new RegExp(`^\\s*${key}:\\s*('(?:[^'\\\\]|\\\\.|'')*')\\s*,?\\s*$`, 'm');

// src/data/tools.js: each tool is a `  {` ... `  },` block holding href, seoTitle and h1.
export function titlesFromToolsSource(source) {
  const out = {};
  for (const block of source.split(/^ {2}\{$/m).slice(1)) {
    const href = block.match(FIELD('href'));
    if (!href) continue;
    const seoTitle = block.match(FIELD('seoTitle'));
    const h1 = block.match(FIELD('h1'));
    out[unquote(href[1])] = {
      seoTitle: seoTitle && unquote(seoTitle[1]),
      h1: h1 && unquote(h1[1]),
    };
  }
  return out;
}

// src/content/localized-tools/<locale>/<slug>.yaml: top-level `seoTitle:` and `h1:` scalars.
export function titlesFromYaml(source) {
  const seoTitle = source.match(FIELD('seoTitle'));
  const h1 = source.match(FIELD('h1'));
  return { seoTitle: seoTitle && unquote(seoTitle[1]), h1: h1 && unquote(h1[1]) };
}
