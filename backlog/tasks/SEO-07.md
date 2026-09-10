---
id: "SEO-07"
title: "The Sign page says almost nothing about the one advantage nobody can copy"
status: "done"
priority: "P1"
epic: "search-acquisition"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-09-11"
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

---

## Outcome (2026-09-11)

### What was already there, and what was actually missing

The supported-script list was **not** missing: `ToolLanguagesCard.astro` already rendered 20 entries
above the FAQ, server-rendered, cross-checked against `src/lib/fontCoverageReport.js` by
`src/lib/languageCoverage.test.js`. That half of the acceptance was met before this ticket was picked
up. What was genuinely absent from the page:

- **Comb fields, entirely.** The word did not appear in any user-facing string on the site. The tool
  detects printed box grids in the PDF (`src/lib/useFormFieldRegions.ts` +
  `src/editor/adapters/pdf/formGrid.js`), outlines them while the Text tool is armed, and snaps a tap
  into a one-character-per-box element. None of it was stated anywhere a visitor reads.
- **RTL growth**, stated per language (Hebrew, Arabic, Farsi, Pashto notes) but never as a property of
  the tool, and never in the card's own lead.
- **The refuse-while-typing guarantee**, mentioned in passing at the end of the Latin note and in the
  "not yet" paragraph, but never framed as the guarantee it is.
- **Which scripts have no bundled font at all.** Named nowhere. `languageCoverage.test.js` actively
  asserted they were *not* named.

### The reversal on naming gaps, made deliberately

`559f0d1` (2026-09-02) retired FONT-04's roadmap and changed the card from promising specific
languages were coming to a demand-driven ask. It went one step further than that needed and stopped
naming gaps at all, pinned by a test titled "emphasizes broad support without naming individual gaps".
This ticket is newer and explicit ("Known limits are named, not omitted"), and CLAUDE.md's standing
rule - a known divergence is named to the user rather than left to be discovered, the same rule that
has the Sign FAQ list the six Bengali shaper divergences - points the same way. Saying "these have no
font yet, ask if you want one" is a statement of where the tool stops, not a roadmap, so it satisfies
both. The test was flipped rather than deleted, and now asserts in **both** directions: every named
script appears in the card and the FAQ, and every named script really has zero covering glyphs across
every file in `FONT_COVERAGE` (generated from the real bytes in `public/fonts/`). A font landing that
draws Gujarati therefore fails the build rather than leaving the page understating the tool.

Named: Gujarati, Kannada, Odia, Sinhala, Khmer, Lao, Burmese, Amharic, Armenian, Georgian, emoji. All
eleven verified at zero covering font files.

### `seoTitle` / `seoDescription`, re-examined against the export

Source: `~/Downloads/pdkef.com-Performance-on-Search-2026-09-10/Queries.csv`, the same export section 1
of `docs/seo-competitive-findings.md` is built from.

**Two facts decided this, and both cut against intuition.**

1. **Every one of the 58 sign queries is device intent. Not one is language intent.** iphone, android,
   computer, windows, pc, phone, laptop, whatsapp - that is the entire list. There is no Hebrew, Hindi,
   Arabic, Bengali or Tamil query anywhere in the file (the export contains exactly two non-ASCII
   queries site-wide, neither about signing). So there is **no measured demand** behind the language
   advantage yet. Rewriting the title around languages would trade an intent the export confirms for
   one it does not show at all.
2. **None of those 58 queries is `/sign/`'s.** They sit at positions 43-66; `/sign/` itself sits at
   **11.64** with 42 impressions. A page at 11.64 does not produce queries at 48. Those queries belong
   to the four OS guides (SEO-08's ticket), and `/sign/`'s own 42 impressions come from queries Search
   Console withheld under its privacy filter. **We do not know what `/sign/` ranks for.** Any title
   change here is therefore a hypothesis, not a correction, and has to be measured as one.

Changed the title, left the description alone:

- `seoTitle`: `Sign PDF Free - Fill Forms in Your Browser | PDkef` -> **`Sign PDF Online Free - Fill
  Forms, No Signup | PDkef`**. Justification is the competitive row this ticket already owns in
  `docs/seo-competitive-findings.md` - "sign pdf online without account", est. 25k-60k, decision
  "Expand both pages" - which the old title served with neither "online" nor "signup"/"account". It
  also matches `/redact/`'s title shape (`Blur PDF Online Free - ...`), which is the page that actually
  ranks. Nothing the export supports was dropped: "Free" stays, and every device word lives in the
  description.
- `seoDescription`: **unchanged.** It already carries iPhone, Android, computer and WhatsApp - which is
  every intent the export actually evidences - in 156 characters. Adding a language clause would
  displace measured vocabulary for unmeasured vocabulary. The language story went into the page body
  instead, where the ticket asked for it.

**Re-measure 2026-10-08**, alongside SEO-01/02/04/05, off one export. The title is the only variable
changed above the fold that a SERP can see, so `/sign/`'s impressions and CTR against its 42 / 2.38% /
11.64 baseline are the read.

### What shipped

- `subhead` now states the language count and the comb behaviour above the fold, replacing "Language
  support and practical limits are listed below."
- `languages.lead` states RTL growth and the refuse-while-typing guarantee.
- `languages.notYet` names the eleven uncovered scripts.
- Two FAQ entries, mirrored into `<SeoSchema>` automatically since both read `tool.faq`: the printed
  boxes ("The form has a row of little boxes, one per letter") and the refusal guarantee ("What happens
  if the tool cannot draw a character I type?").
- The "Add text & signatures" step names the printed boxes.
- `languageCoverage.test.js` gained a `describe` pinning all four of the above plus the six Bengali
  divergences, and the uncovered-script assertion described above. The comb copy is pinned as *not*
  containing the word "comb": that is the form-printing term of art and means nothing to the person
  holding the form.

Verified: `npx vitest run` (2130 passed), `npm run build`, `npm run test:seo` (23 pages),
`verify-csp.js`, `npm run test:css`, `check-page-weight.js` (`/sign/` 340,523 of 400,000 brotli).
Single `<h1>` preserved; the languages card renders above the FAQ in the body.

### Left for the tickets that own it

The deep positioning review is SEO-12 and the language landing page is SEO-18, both unchanged by this.
Also untouched, and worth stating: **language support still has no measured search demand.** SEO-18
should treat that as its first open question rather than assuming this ticket established it.
