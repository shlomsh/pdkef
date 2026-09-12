---
id: "SEO-33"
title: "Read 2026-10-08 · Compress ranks page one and never says reduce, shrink, resize or size reducer, the words with the volume"
status: "blocked"
priority: "P1"
epic: "seo-awaiting-read"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# SEO-33 · Read 2026-10-08 · Compress ranks page one and never says reduce, shrink, resize or size reducer, the words with the volume

*Re-filed 2026-09-12* from `search-acquisition` into `seo-awaiting-read`, status `open` to `blocked`, read date 2026-10-08: shipped, indexing requested 2026-09-12.

## Why now (decided 2026-09-12)

Three instruments read together on 2026-09-12 (Google Trends, iLovePDF's Keyword Planner export,
Keyword Planner's ideas list for pdkef.com; the read is in the findings doc, section 2):

- `/compress/` is the one head-term page this domain has on page one (position 10.39, 12 clicks).
- Keyword Planner's ideas for pdkef.com put `pdf size reducer`, `shrink pdf size`, `shrink size of a
  pdf` and `compress pdf` in the 1M to 10M bucket, `resize pdf` in 100K to 1M. Every one of them is
  the tool we already ship. The "Low" competition column there is ad competition, not organic
  difficulty; read the volumes, ignore that column.
- The page says "Reduce File Size" in the title and h1, "shrink" twice in the body, and "resize" and
  "size reducer" nowhere. This is the same lesson SEO-09 learned on `/split/` (we rank for a
  vocabulary we do not use), applied to the page where a vocabulary fix can compound on an existing
  position instead of starting from 85.

This is the cheapest extension of a proven position on the site, which is why it is P1 ahead of any
new URL.

## Scope

All copy lives in the `compress` entry of `src/data/tools.js` (the same island and page; no new URL,
no doorway variant, no change to what the tool does).

- **Title and h1 stay anchored on `compress pdf to 100kb`** (the cluster we already win) and keep the
  "Reduce File Size" tail. Do not lengthen the title past the schema's 75 characters.
- **`subhead` and `aboutLead`** carry "shrink" and "reduce" in natural sentences, once each, in the
  register the page already has. `aboutLead` is doing snippet work (Google discards our description
  on some queries, findings doc section 2), so the first sentence matters most.
- **One new FAQ entry for the "resize" sense.** People typing `resize pdf` overwhelmingly mean file
  size, and some mean page dimensions. Say which one this tool does (file size) and what it does not
  (it does not change page dimensions), honestly, in one answer. FAQ JSON-LD is generated from the
  same array, so the on-page and schema text stay identical by construction.
- **One new FAQ entry for "size reducer"**: "Is this a PDF size reducer?" or equivalent, answered with
  what the target-size search actually does and the rasterization caveat SEO-05 made visible.
- Keep every honest disclosure SEO-05 and SEO-13 shipped (rasterization, passthrough, "if it can't hit
  the target we say so"). Voice rules apply: no intensifiers, no competitor names, no em dashes.

## Hebrew edition

`/he/compress/` is published against a `sourceHash` of the English entry. Any English edit stales it
and the build refuses (LOC-10's intended gate). Recompute the hash (`toolSourceHash` in
`src/i18n/localizedTools.ts`), keep `status: published`, and add a dated line to `reviewNotes`
stating that the English gained the reduce/shrink/resize vocabulary and two FAQ entries and that the
Hebrew edition does not yet carry them, pending Shlomi's review. Do not translate on his behalf; the
Hebrew phrasing decision (כיווץ vs דחיסה vs הקטנה) is LOC-03's and his.

## Acceptance

- "shrink", "reduce", "resize" and "size reducer" each appear in server-rendered HTML on `/compress/`
  outside the FAQ at least once (resize and size reducer may live in the FAQ only, since their sense
  needs the caveat).
- Two new FAQ entries as above; FAQ count stays within the schema's 3 to 12.
- Single `<h1>`, title within 75 characters, primary keyword unchanged.
- `npm test`, `npm run typecheck`, then `npm run build && npm run test:seo && npm run test:css &&
  npm run test:weight` green.
- One indexing request for `/compress/` after merge (date recorded here), then read positions on
  `pdf size reducer`, `shrink pdf size`, `resize pdf` at the 2026-10-08 refresh alongside SEO-05.

## Update 2026-09-12

Copy shipped in `src/data/tools.js`'s `compress` entry: `subhead` now says "shrink the file" and
`aboutLead`'s first sentence keeps "Reduce the file size"; two FAQ entries added ("Does this tool
resize a PDF?" and "Is this a PDF size reducer?"), each with an honest, single answer. Title and h1
are unchanged. `npm test` (2482 passed) and `npm run typecheck` (0 errors) are green; build and the
seo/css/weight suites were left to the lead running them once for the whole worktree.

`src/content/localized-tools/he/compress.yaml`'s `sourceHash` was recomputed mechanically
(`toolSourceHash`) to clear the freshness gate; the Hebrew wording itself was not touched, and
`reviewNotes` records that pending Shlomi's review. Indexing request and position read stay open,
per the acceptance section above.

*2026-09-12:* deployed; indexing requested for `/compress/` in Search Console the same day. Hebrew edition re-reviewed and approved by Shlomi on the deployed site. Nothing left but the 2026-10-08 read.
