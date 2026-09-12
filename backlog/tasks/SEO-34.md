---
id: "SEO-34"
title: "The home page has the site's best CTR and no query to rank for: target pdf tools"
status: "open"
priority: "P1"
epic: "search-acquisition"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# SEO-34 · The home page has the site's best CTR and no query to rank for: target pdf tools

## Why now (decided 2026-09-12)

- `/` earns 11 clicks from 100 impressions, an 11% CTR at position 22.30 (2026-09-10 export): the
  best CTR on the site, on a page that targets no query. Its title and h1 describe the product
  ("Free PDF tools that run on your device") without being shaped around any phrasing people type.
- Keyword Planner's ideas list for pdkef.com (2026-09-12) shows `pdf tools` at 100K to 1M monthly
  searches, +900% year on year, the only row on the list with a growth signal. A static launcher page
  over ten tools is exactly what that query wants.
- The home page is also the hub every internal link passes through, so a page that earns its own
  impressions helps the never-crawled nine (SEO-06) more than any single tool page can.

## Scope

All copy lives in `src/data/homeContent.js` (title, description, h1, subhead, FAQ). The home page's
layout invariants do not move (one canonical DOM, first screen is one composed unit; see
`.claude/rules/home-page.md`); this is a words change.

- **Title** leads with the query: `Free PDF Tools Online - Run on Your Device, No Upload | PDkef` or
  the closest phrasing that keeps "pdf tools" in the first three words and stays under 75 characters.
- **h1** keeps its shape and its `h1Accent` contract (the accent must remain an exact trailing
  substring of `h1`). "Free PDF tools that run on your device" already contains the phrase; keep it or
  tighten it, do not lose it.
- **Description** names the ten tools' jobs in the user's words (merge, split, compress, sign, blur,
  convert) and the one fact only we can state: nothing is uploaded.
- **Subhead** currently lists five tools; it can name the family ("ten PDF tools") and keep the
  privacy line.
- **FAQ**: if the home FAQ does not already answer "Is this a set of free PDF tools with no signup?",
  add one entry in the existing register. FAQ JSON-LD derives from the same array.
- Voice rules apply: modest, no intensifiers, no competitor names, no em dashes. "Free because it
  should be", never as a funnel.

## Hebrew edition

`src/content/localized-home/he.yaml` is published against a `sourceHash` of `homeContent.js` and the
build refuses on a stale hash. Recompute it (`normalizeHomeSource` + `documentationSourceHash`, see
`src/i18n/localizedHome.ts`), keep the entry published, and add a dated `reviewNotes` line stating
which English fields changed and that the Hebrew title/description do not yet mirror them, pending
Shlomi's review. Do not translate on his behalf.

## Acceptance

- `<title>` on `/` contains "PDF tools" (case-insensitive) within its first three words; h1 contains
  "PDF tools"; `h1Accent` still an exact trailing substring of `h1`.
- Single `<h1>`; the first screen's DOM structure unchanged (`e2e/home/` guardrails untouched and
  green if run).
- `npm test`, `npm run typecheck`, then `npm run build && npm run test:seo && npm run test:css &&
  npm run test:weight` green.
- One indexing request for `/` after merge (date recorded here). Read `pdf tools` / `free pdf tools`
  impressions and the home page's position at the 2026-10-08 refresh.
