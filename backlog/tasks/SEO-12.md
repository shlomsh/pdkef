---
id: "SEO-12"
title: "Positioning review: Sign, the tool with the biggest gap between what it does and what it says"
status: "open"
priority: "P1"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-11", "SEO-07"]
legacy_state: "Open"
---

# SEO-12 · Positioning review: Sign, the tool with the biggest gap between what it does and what it says

## Scope and acceptance

**Run this as a dedicated review with a real budget**, following the method in SEO-11. It is first
because the gap is largest: worst-performing cluster in the Search Console data (154 impressions,
weighted position 51.7, zero clicks), deepest product work in the repo, and the only tool with an
advantage no free competitor comes close to.

**The advantage, stated precisely so the review does not overclaim it.** Real font embedding for Hebrew,
Arabic, Pashto, Bengali, Devanagari, Tamil, Telugu, Gurmukhi, Thai, Cyrillic and Greek. UAX#9 bidi with
explicit paragraph direction. Per-glyph shaped positioning, so vowel points and conjuncts land where the
shaper put them rather than where the font's advance widths guess. RTL text boxes that grow leftward from
a fixed right edge. Comb-field detection, so a multi-column numeric field is typed once rather than
character by character. Curated fonts with named divergences disclosed rather than hidden.

Free competitors are Latin-first. Most do not embed a font at all - they draw a signature image and type
in a system font, which is why non-Latin text comes back as boxes. That is the comparison, and per SEO-11
it must be stated as our fact and never as their failure.

**Where the review should be sceptical of itself.** "Supports 11 scripts" is a marketing sentence.
"You can fill a Hebrew form, right to left, and the letters come out in the right order in the file you
download" is the thing a person needed. The audience for this is people filling official forms in their
own language, often on a phone, often from an attachment. Write for them.

**Specific things to examine, beyond the SEO-11 method:**

- Does anything on `/sign/` reach a searcher who types in Hindi, Tamil or Bengali script? Should it?
  Note that this is a different question from SEO-27's decision about translated pages, and the answer
  may be that a single English page naming the languages is enough.
- The five "how to sign on pdf file sent through whatsapp" query variants (19 impressions, positions
  48-50). Our copy already names the WhatsApp case; the review should decide whether that is a section,
  a guide, or already adequately said.
- The comb-field behaviour has no vocabulary in our copy at all. Nobody searches for "comb field", so
  find the words people do use for a boxed-per-character form field, from the query data if it is there.
- India, Malaysia, Indonesia, the Philippines and Pakistan are the top five countries after Israel.
  Check that nothing in the copy assumes a US or European document context.

**Acceptance.**

- The SEO-11 method is followed end to end and its outputs recorded here: the query list, the top-ten
  analysis for the three biggest queries, the word-by-word comparison, the named differentiator.
- Proposed copy is delivered as a concrete diff against `src/data/tools.js` and the `.astro` surface,
  not as a description of what should change.
- Every claim carries its evidence; no claim about a competitor appears anywhere.
- Language claims are derived from the generated coverage data, consistent with SEO-07, and known
  divergences stay disclosed.
- Whatever ships, `npm run test:seo` passes, the single `<h1>` and primary keyword placement hold, and
  FAQ changes are mirrored into `<SeoSchema>`.
- The review's conclusions are folded back into SEO-11's protocol if it turned out to be missing a step.
