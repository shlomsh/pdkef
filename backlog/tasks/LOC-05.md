---
id: "LOC-05"
title: "Publish the eight reviewed Hebrew guides alongside the Hebrew tool pages, so the edition cross-links"
status: "done"
priority: "P3"
epic: "hebrew-edition"
phase: "near-term"
depends_on: ["LOC-03"]
legacy_state: "Open"
---

# LOC-05 · Publish the eight reviewed Hebrew guides alongside the Hebrew tool pages, so the edition cross-links

*Re-filed 2026-09-12* from `localized-search` into `hebrew-edition`: left: one indexing request per URL, and the /edit-pdf/ CTA disclosure gap.

## Scope and acceptance

**What this is.** [SEO-27](SEO-27.md) framed the decision on the eight Hebrew guide drafts in
`src/content/localized-pages/he/`; the decision is now yes (LOC-01, 2026-09-11), and the review pass is
this ticket's work. It also covers the part SEO-27 could not see:
once LOC-03's Hebrew tool pages exist, a Hebrew guide's `primaryCta` should point at `/he/sign/`, not
at the English `/sign/`, and the Hebrew tool page's guide cards should point at the Hebrew guides.
Today `localizedPages` entries link to `/sign/` because nothing else exists, and the design record's
rule is "a localized guide may link to an untranslated tool, but disclose the English destination".
With LOC-03 shipped that disclosure comes off and the links resolve within the edition.

**Order.** Do not publish the guides before the tool pages. Eight Hebrew guides pointing at an English
tool is the mixed-language experience this epic exists to beat. Publish them in the same window as
LOC-03, so the edition arrives whole and cross-linked from the first crawl.

**Acceptance.**

- Every published Hebrew guide's CTA and related-guide links resolve inside `/he/`; the English
  fallback label is shown only where a target really has no Hebrew edition.
- `hreflang` sets on the guides and tool pages are reciprocal across the whole edition (LOC-02's
  guard covers it; this ticket makes sure the fixture includes a guide-to-tool pair).
- One indexing request per URL, dated here. Outcome folded into LOC-03's eight-week read.

## Published 2026-09-11: seven of eight, reviewed on the live site

Shlomi asked for the guides to go live and be reviewed in production rather than in a preview build,
so `reviewNotes` on each says exactly that. What shipped:

- Seven guides `published`: the four `how-to-sign-a-pdf-on-*`, `install-pdf-app`,
  `open-source-pdf-editor`, `sign-pdf-no-signup`. Five were **stale** against their English (SEO-08's
  three screenshots on the four OS guides, plus small wording edits); the screenshot blocks were added
  to the Hebrew with Hebrew alt text and per-OS captions, and every `sourceHash` refreshed from the
  build's own expected value. The Hebrew editions are re-authored rather than literal, and none carried
  the other changed English sentences (license claim, "Share now", the `/redact/` link label), so those
  needed only the hash.
- **`offline-pdf-form-filler` held as `draft`**: its English is a retired route that `vercel.json`
  301s to `/install-pdf-app/`, so a published Hebrew twin would have an `x-default` pointing at a
  redirect. Decide its fate with the English page, not here.
- Every link whose target has a Hebrew edition now resolves inside `/he/` (`/he/sign/` CTAs and body
  links, `/he/install-pdf-app/` from the Android guide). `/edit-pdf/` (open-source guide's CTA),
  `/redact/`, `/licenses/`, `/permanently-delete-text-from-pdf/` stay English because no edition exists.
  **Gap against the acceptance above:** the CTA to `/edit-pdf/` carries no "EN" disclosure; the layout
  has no CTA-level fallback mark, only the related-guide cards do.
- `vercel.json` gained the seven non-slash → slash pairs; CSS duplication ratchet re-based 7.75x → 9.00x
  for the page count (measured 8.81x at 36 pages; both page-count-invariant ratchets unchanged to the
  byte). `test:seo`, `test:csp`, `test:css`, `test:weight`, `test:redirects`, `test:licenses` and the
  2221-test unit suite green.

**Left open:** Shlomi's live review, and one indexing request per URL, dated here (Search Console's
daily quota was already hit on 2026-09-11 by the `/he/` tool pages and `/pdf-wont-compress-to-100kb/`
attempt, so these wait for the next day).

## 2026-09-12: CTA disclosure gap closed

The gap noted above is fixed. `ContentPageLayout.astro`'s primary CTA now runs the same
`published.has(href)` decision `ToolCrossLinks.astro`/`RelatedGuides.astro` already make per card
(`src/i18n/localizedTools.ts`'s `getPublishedEditionPaths`), pulled into one small helper,
`isPublishedEditionLink(href, locale, editionPaths)`, so the CTA asks the identical question instead of
a second copy of the logic. Both content-page routes (`src/pages/[contentPage].astro` and
`src/pages/[locale]/[contentPage].astro`) now pass `editionPaths` through to the layout; the layout
renders the same "EN" mark, in the same Tailwind register (`ToolCrossLinks`' own span, adapted to
`--color-surface` for legibility on the CTA's colored pill background rather than a card's white one),
with the same `messages.inEnglish` label from `documentationMessages.ts`, plus `hreflang="en"` on the
anchor to match the convention those two components already set.

Verified in the build: `/he/open-source-pdf-editor/`'s CTA to `/edit-pdf/` now carries the "EN" mark
(the only Hebrew guide whose CTA has no Hebrew edition to point at). Every other published Hebrew
guide's CTA (`/he/sign/`) carries none, and no English page ever does - confirmed by grepping `dist/`
after `npm run build`. Unit test: `src/i18n/localizedTools.test.ts`'s `isPublishedEditionLink` describe
block (Hebrew + English-only target → flagged, Hebrew + `/he/sign/` target → not flagged, English page
→ never flagged, whatever the href). `npm test` (2485 tests), `npm run typecheck`, and post-build
`test:seo`, `test:css`, `test:weight`, `test:csp` all green with no ratchet regression.

Only Shlomi's indexing requests (noted above) remain on this ticket.

*2026-09-12, closed:* indexing requested for every published Hebrew guide the same day; the CTA disclosure gap closed at `6223372`. Outcome folds into LOC-03's 2026-11-06 read.
