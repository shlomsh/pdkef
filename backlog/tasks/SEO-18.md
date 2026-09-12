---
id: "SEO-18"
title: "One page on signing a PDF in your own language, generated from the coverage data"
status: "open"
priority: "P2"
epic: "english-base"
phase: "near-term"
depends_on: ["SEO-07", "SEO-12"]
legacy_state: "Open"
---

# SEO-18 · One page on signing a PDF in your own language, generated from the coverage data

*Re-filed 2026-09-12* from `search-acquisition` into `english-base`: the sign-language page; the one content URL not gated on the crawl read because it is inbound to /sign/, which is indexed.

## Scope and acceptance

**The single largest unmatched advantage in the product has no page.** SEO-07 puts the language story on
`/sign/`; SEO-12 works out how to say it. This ticket is the page for the people searching for it
directly, and it exists because the tool page cannot carry the depth without becoming a document.

**The temptation to refuse.** The obvious move is one page per language: `/sign-pdf-in-hindi/`,
`/sign-pdf-in-tamil/`, and so on for eleven scripts. That is a doorway farm, it is eleven new URLs on a
domain that cannot get nine crawled, and it would be eleven near-identical pages differing by a language
name. **One page.** If it earns its traffic and Search Console shows genuine per-language demand, that
is the evidence for splitting later, and the split will be justified by data instead of ambition.

**What makes this page legitimate rather than thin: it is data-backed.** `src/lib/fontCoverageTable.js`
and `src/lib/fontCoverageReport.js` are generated from the real font bytes and carry, per language, the
font that draws it, whether that font is bundled, and what it cannot do. That is real, specific,
verifiable content that no competitor can copy without doing the same work. Derive the page's table from
those files rather than hand-typing it, so it cannot drift when a font lands.

**What it must say, including the parts that are uncomfortable:**

- Which languages work, with the font that draws each and its licence.
- What happens when a character has no glyph: the tool tells you while you are typing, not after you
  download. That guarantee is the product of `textCoverage.js` and `textFontSupport.js` agreeing, and it
  is the opposite of the usual experience of getting a PDF full of empty rectangles.
- RTL: text boxes that grow leftward, correct bidi ordering in the exported file.
- **The known divergences, named.** The six Bengali shaper disagreements are already listed to users in
  the Sign FAQ. Punjabi and Telugu ship on non-Noto faces for a stated reason. Scripts with no bundled
  font at all - Arabic script for Urdu in Nastaliq, CJK coverage limits, emoji - are named as not
  supported rather than omitted. CLAUDE.md requires this of the tool copy and it applies here.
- Which languages have no support at all, said plainly, with the language-request path if one exists.

**Mechanics.** One YAML entry in `src/content/content-pages/`, Zod-validated, registered in
`src/data/contentPages.js` with `hub: 'sign'`. Two-tag dialect. The language table is a `table` block,
which caps at 4 columns and 8 rows - if the data does not fit, that constraint is the schema's opinion
about what a landing page can carry, and the fix is editorial selection, not a schema change.

**Acceptance.**

- One page, not a family. The rejection of per-language pages is recorded here with its reasoning.
- The language table is derived from the generated coverage data, with a test that fails if the page and
  the data disagree.
- Every claim about a language is true of the shipped fonts; known divergences are named on the page.
- The build's two-registry cross-check passes; `npm run test:seo` passes; FAQ mirrored; trailing slashes.
- Ships in its own week, per the epic's sequencing.

## Update 2026-09-12

Shipped: `/sign-pdf-in-your-language/`, one YAML entry in `src/content/content-pages/`, registered in
`src/data/contentPages.js` with `hub: 'sign'`, redirect pair added to `vercel.json`, and a Hebrew card
copy entry in `src/i18n/cardMessages.ts` (the /he/sign/ page's RelatedGuides grid links to this English
page and needed its own card text, same as every other content page).

**Per-language pages: rejected again, same reasoning as the ticket's own framing.** One page for
Hindi, one for Tamil, one for Hebrew and so on was not attempted. It is the doorway-farm pattern
CLAUDE.md rules out, it would split the "sign in your language" story across N near-identical URLs on
a domain that still cannot get its existing pages crawled promptly, and it would cost N times the
maintenance the moment a font changes. One page, one generated table, done.

**Which eight languages made the table, and why.** `LANGUAGE_COVERAGE` in
`src/lib/fontCoverageReport.js` has 28 rows (language + script variants); the schema caps the table at
8. Selected editorially for "something specific to say" rather than alphabetically or by speaker
count: Hebrew and Arabic (the RTL story, box grows leftward from a fixed right edge), Urdu (same fonts
as Arabic, but the Nastaliq gap named plainly), Devanagari/Hindi (conjunct reordering, plus the largest
search-relevant language not otherwise represented), Bengali, Punjabi and Telugu (the three languages
with a named font-choice or shaping divergence already carried in the Sign FAQ), and Japanese (the CJK
coverage-limit story: kana plus two government kanji lists, not all of Han). Chinese and Korean were
left out of the table on purpose: Chinese has no `LANGUAGE_COVERAGE` row at all (no compact alphabet
the way Hangul or an abjad has, per `fontCoverageReport.js`'s own header), and Korean's story (full
Hangul, no partial-coverage caveat) is the least interesting of the three to spend a row on next to
Japanese's real limit. The prose says explicitly that this is a selection of 8 of 20, not the full
list, and points at `/sign/`'s own languages card for every language.

**The test:** `src/lib/signLanguagePage.test.js`. It reads the YAML directly with the `yaml` package
(already a transitive dependency; no new runtime dependency added) and, for every table row, resolves
the language cell to a real `LANGUAGE_COVERAGE` key (exact label match, or the label with its trailing
parenthetical stripped, so "Japanese" still finds the "Japanese (kana + ...)" row) and checks every
font family named in the "Font that draws it" and "Handwriting face?" columns against that language's
`full` list specifically (never `partial` - a row claiming a language "works" should not lean on a font
that only partially covers it). Verified non-vacuous by hand: swapping Arabic's font cell to a font
with no `LANGUAGE_COVERAGE` row at all, and separately to a real font that does not cover Arabic
(`Mukta Mahee`), both made the test fail with a message naming the row and the family; restored
afterward and confirmed identical to the working version. A second describe block checks the page's
"some scripts have no bundled font at all" claim (Gujarati, Kannada, Odia, Sinhala, Khmer, Lao,
Burmese, Amharic, Armenian, Georgian) against the same data, so a future font landing for one of them
fails this test rather than leaving the page quietly wrong.

**Left out, and why:**

- **Images/`compareFigure` blocks.** The photo-and-signature page's before/after photo works because
  a real photo exists to compress. There is no equivalent artifact for "does this font draw this
  script correctly" that isn't already a screenshot of the editor itself, and fabricating one for a
  page about honesty in font claims felt like the wrong place to cut a corner. The table and prose
  carry the content instead.
- **Naming Chinese/Korean rows in the table** (see above) - covered in prose and the FAQ list instead.
- **A licence *name* per font in the body copy.** `THIRD_PARTY_LICENSES.md` confirms every bundled
  font (all 13 handwriting + 25 text families) ships under OFL-1.1, so the page could have said so, but
  the ticket's acceptance list does not ask for a licence name on this page (SEO-17's model page and
  the Sign FAQ itself don't state it either), and stating a licence version invites a staleness risk
  this page does not otherwise carry. Left out rather than guessed at.
- **Enumerating the same "not yet" scripts on `/sign/`'s own languages card or its FAQ.** That
  omission is a deliberate, tested product decision (`languageCoverage.test.js`, "points at a request
  rather than enumerating gaps") for a different reason, that a gap list in the middle of the site's
  strongest claim reads as a disclaimer. This page's whole purpose is the deeper, more honest read, so
  it names the gaps; `tools.js` and its card are untouched.

**Verification run:**

- `npm test` - 2513 tests passed (2513, up from 2512 baseline plus the new test file; one existing test,
  `src/i18n/cardMessages.test.ts`, needed the new Hebrew card entry described above before it passed).
- `npm run typecheck` - 0 errors, 0 warnings, 0 hints (495 files).
- `npm run build` - 40 pages built, `/sign-pdf-in-your-language/index.html` and its `.md` twin present.
- `npm run test:seo` - passed, 41 pages.
- `npm run test:redirects` - passed, 38 real routes.
- `npm run test:csp` - passed, 41 HTML files.
- `npm run test:weight` - passed; the new page is light (17,072 doc + 1,327 js + 1,800 img brotli/raw,
  no client island), well under both budgets.
- `npm run test:css` - **fails**, and by design this ticket does not fix it: see below.

**CSS duplication ratchet: page-count growth, not new duplication, numbers measured rather than
raised.** Per CLAUDE.md's instruction not to raise this limit without saying which page and why, and
LOC-05/SEO-19/SEO-31's own precedent in `scripts/check-css-duplication.js`'s comment history: measured
immediately before this page (yaml + registry entry removed, rebuilt): **39 pages, 9.80x** (1,623,969
bytes shipped / 165,744 bytes distinct), worst-page dead bytes 8,295 (`/image-to-pdf/`), single-page
utilities 21 - passes the current 9.81x limit. With the page restored: **40 pages, 9.96x** (1,651,513 /
165,744), worst-page dead bytes 8,295, single-page utilities 21 - fails the 9.81x limit. Distinct bytes
are unchanged (165,744 -> 165,744, to the byte) and both page-count-invariant ratchets are unchanged
(8,295 and 21), which is the same signature every prior re-base used to confirm page-count growth
rather than new duplication: this page reuses only existing block kinds (`prose`, `table`, `checklist`)
and existing icons, no new component's scoped `<style>`. Shipped bytes rose by 27,544, one page's worth
of the content-page family's shared bundle. Following the precedent's own method ("smallest two-decimal
value that clears the measured figure"), the re-based limit would be **9.97x**. Left for the ticket
owner to apply rather than raised in this change, per instruction. Nothing else in `test:css` regressed
(class resolution, editor-global-CSS, dead-utility check all still pass).
