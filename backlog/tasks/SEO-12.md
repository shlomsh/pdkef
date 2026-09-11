---
id: "SEO-12"
title: "Positioning review: Sign, the tool with the biggest gap between what it does and what it says"
status: "done"
priority: "P1"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-11", "SEO-07"]
legacy_state: "Done 2026-09-11"
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

## Progress (2026-09-11)

**Run end to end, per the SEO-11 method. Finding: the review's own diagnosis (2.3's progress note) held
up under the full method, and the conclusion is that no further copy change is warranted beyond what
SEO-07 already shipped, for reasons recorded below rather than invented filler.**

**1. Query list.** Pulled all 58 sign-cluster queries directly from the raw `Queries.csv` behind the
2026-09-10 export (not just the cluster aggregate in section 1), filtered for `sign`/`whatsapp`. Every
one is device-intent (iphone / android / computer / windows / whatsapp), positions 43-90. Also checked
the full 207-row export for any language-name or script-name query ("hebrew", "arabic", "hindi",
"comb field", "boxed field", etc.) - **zero matches, anywhere in the export, not just the sign
cluster.** Confirms 2.3's finding with the primary data rather than the summary: there is no
language-intent or comb-field-vocabulary demand recorded at all, so there is no query-derived wording
to add for either.

**2. Top-ten analysis, three highest-impression queries** ("sign pdf on iphone" 14 impr / pos 48.64,
"sign pdf on android" 12 / 46.5, "how to sign pdf on computer" 12 / 46.17). Google direct capture is
blocked for scripted fetches (per SEO-04/05); Shlomi supplied live Google and Bing screenshots for the
first query, cross-checked against WebSearch results for all three. Consistent picture across all three
queries and both engines:

- Page one is Apple/Microsoft first-party docs (Markup, Preview, Edge draw tool), Adobe, Dropbox,
  Smallpdf, and video results (YouTube/WikiHow), plus - on Bing - four sponsored ad slots from
  PDFLeader, Files Editor, PDFAid and pdfhouse.com.
- The ad copy is exactly SEO-11's table in the wild: "Free", "Works on Any Device", "Secure Digital
  Signatures", "Easy To Use Tools" - the same four claims we make, asserted with no evidence, from sites
  that upload the file. Direct confirmation that the evidence-attached version of these claims is real
  whitespace, not a hypothesis.
- Nothing in ten results across three queries and two engines mentions non-Latin script, RTL, or a
  multi-language claim of any kind. This is not a query where language support competes for the click -
  it is a device-workflow query, and the searcher's next question is "how", not "in what language."
- No small privacy-first no-upload tool appears in position 1-10 on any of the three. This is an
  authority gap (age, backlinks, editorial trust), not a copy gap - matches section 4's "Authority" row
  for this cluster exactly, from a different data source.
- **These are the OS guides' queries, not `/sign/`'s.** All three map to
  `/how-to-sign-a-pdf-on-iphone/`, `/how-to-sign-a-pdf-on-android/`, and (split across) `/how-to-sign-a-
  pdf-on-windows/` + `/how-to-sign-a-pdf-on-mac/`. `/sign/` itself earns 42 impressions on queries GSC
  withholds for privacy - this review still cannot see what it ranks for. Folded back into SEO-11 below.

**3. Word-by-word comparison.** Checked the three matching guide pages
(`src/content/content-pages/how-to-sign-a-pdf-on-{iphone,android}.yaml`, the windows/mac pair) against
what the SERPs lead with:

- Built-in-tool-first framing: the SERPs lead with Apple Markup / Preview and Microsoft Edge's own
  draw tool before any third party. Our guides already do this - "Your iPhone already has useful PDF
  tools... If those do what you need, use them. PDkef offers another workflow" - which is the
  explain-don't-compete voice rule applied correctly, and matches how the winning results themselves
  frame it (nobody badmouths Markup either); the iPhone guide even carries a feature-by-feature
  comparison table against Apple's own tools.
- "Free" modifier: Bing's "People also search for" surfaces "sign PDF on iPhone free" and "Sign PDF
  online" as related queries. Both guide titles already carry "for Free" (`how-to-sign-a-pdf-on-
  iphone.yaml`'s title: `'How to Sign a PDF on iPhone for Free | PDkef'`), and `/sign/`'s own
  `seoTitle` already carries both "Online" and "Free".
- WhatsApp: already a full section on the iPhone guide (`## How to sign a PDF sent through WhatsApp on
  iPhone`) and one `/sign/` FAQ entry. At 19 impressions across five query variants, all sitting on the
  OS guide rather than `/sign/`, a dedicated page would be a doorway page against the standing rule in
  `CLAUDE.md` and the already-rejected pattern in SEO-17 - the existing section-within-a-guide is the
  right size for the demand.
- Comb-field: no query vocabulary exists to add (see 1). The FAQ on `/sign/` already describes the
  behaviour in plain language ("a row of little boxes, one per letter... tap one and your text lands
  one character per box") without inventing jargon nobody searches for - correct as shipped.
- Country assumptions: read every guide and every `/sign/` FAQ answer for US/EU-only document framing
  (SSNs, W-9s, state-specific forms, "printer" as the only alternative). Found none - the copy stays at
  "form", "agreement", "consent slip", generic across the top-five-country list.

**4. Named differentiator.** Confirmed against the code, not just the copy: `languageCoverage.test.js`
(32 tests, all passing) pins that `/sign/`'s stated language count matches
`src/lib/fontCoverageReport.js`, generated from the real font bytes, and that the refuse-while-typing
and RTL-box-growth guarantees are stated in the FAQ, not just implied. The differentiator this ticket
named at scope time - real per-glyph shaped font embedding across 20 scripts, RTL boxes anchored to a
fixed right edge, comb-field detection - is exactly what SEO-07 already put on the page (the language
card leading the page, the subhead naming the count, native-script FAQ *questions* for Hindi/Bengali/
Arabic/etc. so a script-intent search has indexable text to match against even with no dedicated
translated page, per SEO-27). Re-verifying it here rather than re-deriving it is the correct move: SEO-07
already did the work this ticket would have proposed.

**5. Proposed copy: none, beyond what SEO-07 shipped.** This is the deliverable, not a shortfall. Every
item in the ticket's "specific things to examine" list resolves to "already correct" or "correctly out
of scope," each for a stated reason above, not by default. `npm run test:seo` and
`languageCoverage.test.js` both pass on the current tree; no file was changed by this review's
conclusions.

**Folded back into SEO-11 (docs/seo-competitive-findings.md, now section 7):** the per-tool method's step 1
("pull the tool's queries... rank them by impressions") silently assumes the cluster's queries rank on
the tool's own page. For Sign they did not - all 58 queries belong to the four OS guides, and `/sign/`
ranks on queries GSC withholds entirely. A reviewer who skips checking the "By page" table against the
query cluster's landing pages will run the top-ten analysis for the wrong page's SERP. Added as an
explicit check in the protocol.
