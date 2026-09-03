---
id: "DEMO-07"
title: "Lead with blur where the traffic actually lands"
status: "done"
priority: "P1"
epic: "landing-story-demo"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-09-04"
---

# DEMO-07 · Lead with blur where the traffic actually lands

## Scope and acceptance

**Blur is one of the strongest search drivers into this product, and the home page mentions it once.** `src/data/tools.js` carries 21 occurrences, `src/content/content-pages/blur-vs-blackout-vs-delete-pdf.yaml` is a whole page about it, and `src/pages/index.astro` has a single hit. The home page is the highest-authority page on the domain and it is nearly silent on the term.

Fix the vocabulary and the prominence, in that order.

**Vocabulary.** "Blur" is what people type. "Redact" is what lawyers say, and it is the word the tool currently leads with. Audit the user-facing strings on `/redact/` and the home page and make blur the primary term, with redact present as the secondary term for the people who do search it. Both should appear; the question is which one leads.

**What not to do.** Do not rename the `/redact/` route. It is indexed, it has inbound content-page links, and CLAUDE.md's URL canonicalization section documents exactly how a redirect there goes wrong (Vercel normalizes the trailing slash *before* matching redirects, which shipped broken once). The visible label, the `<h1>` and the copy can lead with blur without the URL changing.

**Prominence.** The blur story from DEMO-02, hiding a sensitive line on a medical or financial document before sending it, belongs on the home page as one of the two lead use cases, not as a tile in a grid of nine tools.

**Acceptance.** The primary keyword still sits in the `<title>`, the single `<h1>` and the meta description of `/redact/`, per the SEO invariants. `npm run test:seo` passes and the FAQ schema still matches the on-page content it mirrors. No route changes and no new redirects. Record the before and after term counts on the home page in this ticket so the change is measurable rather than asserted.

**Completed 2026-09-04.** The vocabulary half landed separately in 89532d1: `/redact/`'s `gridTitle` ("Blur & Redact"), `seoTitle` ("Blur PDF Online Free - Blackout & Redact Text | PDkef"), `h1` ("Blur PDF Online Free: Blackout & Redact Text") and `subhead` (leads "Blur part of a PDF...") all lead with blur now, redact stays present as the secondary term throughout. `npm run test:seo` passes (23/23 pages) and the primary keyword is still in the title/h1/meta description of `/redact/`. No route or redirect changes were made.

The prominence half was satisfied by the in-flight HeroDemo rewrite (commits d3a4ff8, cb46b04), landed by another agent working in this same worktree while this ticket was open - not by any file this ticket's scope covers (`OfflineProof.astro`/`ToolPageLayout.astro`/`index.astro` have no demo content). Recorded here rather than left unverified, since the acceptance explicitly asks for it:

- Story two of the two-story scroll demo is now the blur/redact story, captioned "Some of it is nobody's business. Blur it out before you reply." and demonstrating all four tools by name in order: **Blur**, Blackout, Whiteout, Delete - blur named first. That is DEMO-02's use case (hiding a sensitive line before sending) reading as one of the two lead stories on the page, not a tile in the nine-tool grid, which is what this ticket asked for.
- Term counts, home page (`dist/index.html`), via the literal commands given in this ticket:
  - Before (last commit prior to this session's work, `8a9e8ac`): `blur` 36, `redact` 8.
  - After (landed, `cb46b04`): `blur` 31, `redact` 17.
  - Caveat worth recording so the raw numbers aren't over-read: both counts are dominated by implementation tokens that have nothing to do with copy - Tailwind's `--tw-blur`/`--tw-backdrop-blur` custom properties (present on every page regardless of content) and CSS-Modules-hashed class names (`_redact-wrap_1s0tw_974`, `_blur-dot_1s0tw_1031`, etc., which change name between builds). Stripping `<style>` blocks and `class="..."` attributes and counting only visible copy + remaining attributes gives a steadier read: before 8/8, after 7/8 - essentially flat, because the home page already had a full blur-led story caption before this session started (an earlier commit, "fold in the two named stories", predates this ticket's work). What changed in the rewrite is the caption's specificity and the four-tool legend naming blur first, not the raw mention count. The qualitative before/after captions are quoted above for that reason - they are the more honest signal than either count.
- No route or redirect changes were involved in the prominence work; `/redact/` is untouched by it.
