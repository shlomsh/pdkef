---
id: "SEO-07"
title: "The Sign page says almost nothing about the one advantage nobody can copy"
status: "open"
priority: "P1"
epic: "search-acquisition"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# SEO-07 · The Sign page says almost nothing about the one advantage nobody can copy

## Scope and acceptance

**Sign is the product's deepest work and its worst-performing cluster.** 58 distinct sign queries drew
154 impressions at a weighted position of 51.7 with zero clicks, and `/sign/` itself managed 42
impressions in three months. Meanwhile India is the top country by a distance (813 impressions, 36
clicks, position 12.66), followed by Malaysia, Indonesia, the Philippines and Pakistan.

Now look at what the tool does. It embeds real fonts for Hebrew, Arabic, Pashto, Bengali, Devanagari,
Tamil, Telugu, Gurmukhi, Thai, Cyrillic and Greek, with UAX#9 bidi, per-glyph shaped positioning, native
RTL text boxes that grow leftward, and comb-field detection that lets a multi-column numeric field be
typed once. Every one of those was expensive, several are documented across `docs/` at length, and the
combination is not matched by any free browser-side signer we are aware of. It is aimed, by accident,
squarely at the audience already arriving.

The page's subhead ends with "Language support and practical limits are listed below." That sentence is
the entire advantage, in nine words, below the fold.

**What this ticket is.** Bring the language story up to where it is read, on the tool page, in the
static server-rendered surface. Not a claim of universality - a specific, checkable statement of which
scripts work, what happens when a glyph is missing (the tool refuses while you type rather than
producing boxes at download), and where the known limits are. CLAUDE.md is explicit that a known
divergence is named to the user rather than left to be discovered; that rule applies here too, and it
is a differentiator rather than a cost, because nobody else discloses anything comparable.

**What this ticket is not.** It is not the deep positioning review (SEO-12) and not the language landing
page (SEO-18). It is the tool page's own copy. Keep them separate so this one can ship in a day.

**Two constraints.** The language list must be derived from the generated coverage data
(`src/lib/fontCoverageTable.js`, `src/lib/fontCoverageReport.js`) rather than hand-typed, or it will
drift the first time a font lands - those files are GENERATED and there are existing tests that
regenerate them in memory and fail on disagreement. And the copy is static: it lives in
`src/data/tools.js` and the `.astro` surface, never inside the island.

**Acceptance.**

- The supported-script list appears in the server-rendered HTML of `/sign/` above the FAQ, derived from
  the generated coverage data, with a test pinning that it cannot drift from it.
- The RTL and comb-field behaviours are stated in plain words a non-technical person understands, not in
  the vocabulary of the design docs.
- The refuse-while-typing behaviour is stated as the guarantee it is: you find out a character cannot be
  drawn while you are typing it, not after you download.
- Known limits are named, not omitted. At minimum: which scripts have no bundled font at all, and that
  the six Bengali shaper divergences already listed in the Sign FAQ stay listed.
- `seoTitle` and `seoDescription` for `/sign/` are re-examined against the actual sign queries in the
  Search Console export, and any change is justified here against them rather than against intuition.
- FAQ changes mirrored into `<SeoSchema>`; `npm run test:seo` passes; single `<h1>` preserved.
