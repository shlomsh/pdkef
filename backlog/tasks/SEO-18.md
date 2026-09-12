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
