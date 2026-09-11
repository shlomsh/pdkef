---
id: "LOC-09"
title: "Localize the home page, so /he/ is a real edition and not a 404 beside three Hebrew tool pages"
status: "open"
priority: "P3"
epic: "localized-search"
phase: "later"
depends_on: ["LOC-03", "LOC-05"]
legacy_state: "Open"
---

# LOC-09 · Localize the home page, so /he/ is a real edition and not a 404 beside three Hebrew tool pages

## Scope and acceptance

**What this is.** The design is already written:
[docs/home-page-localization-plan.md](../../docs/home-page-localization-plan.md) (2026-09-11) reads the
actual `index.astro`, `HeroDemo`, `FileDropzone`, `homeContent.js`, `index.md.ts` and the i18n modules,
and specifies how `/` becomes a localizable page family on the same infrastructure LOC-02 built for
tool pages - the review gate, the `x-default`/alternates contract, RTL, the precache exclusion. This
ticket exists so that document has an owner on the board; it was merged as a design doc with no task,
and a design doc with no ticket is how work gets silently started or silently forgotten. **Read the
doc before scoping; do not re-derive it here.**

**Why it is not urgent, and what would make it so.** `/he/compress/`, `/he/merge/` and `/he/sign/` are
live (LOC-03), and every one of them has a switcher that offers the English home page because there is
no Hebrew one. That is a visible seam, but it is not the pilot's hypothesis: the pilot tests whether
localized *tool* pages earn in-language impressions, and the home page is a router, not a landing page
for search traffic (CLAUDE.md, "What the home page is for"). So this waits on two things: LOC-03's
first Search Console read showing the Hebrew edition earns anything at all, and LOC-05 publishing the
guides so the edition is whole. If LOC-03 comes back empty, this ticket closes with it.

**Known gap to fold in**, flagged in the doc's §6 (and a non-goal in its §9) and in LOC-02's closing note: the Markdown twins
(`src/pages/[slug].md.ts`, `index.md.ts`) are English-only, so `Accept: text/markdown` on a Hebrew URL
falls through `middleware.ts` to the `/404.md` fallback. Decide whether a localized twin is part of this ticket or its own; either
way, record it.

**Acceptance.**

- `/he/` renders as a reviewed, published, RTL-correct edition of the home page through the same
  `status`/`reviewer`/`reviewedAt`/`sourceHash` gate the tool pages use; a draft renders `noindex`.
- The switcher on every Hebrew page links to `/he/` and the English home page lists the Hebrew edition;
  `hreflang` reciprocal with `x-default`, `verify-seo.js`'s localized guards passing on the new route.
- The home page's CLS and first-paint invariants (one canonical DOM reshaped by CSS, no re-parenting,
  the launcher's viewport-derived height) are preserved on the Hebrew edition and checked in a real
  browser, since the RTL grid is the change most likely to disturb them.
- `npm run build && npm run preview` CSP pass; `test:seo`, `test:css`, `test:weight`, `test:redirects`
  green; the non-slash redirect pair for `/he` added to `vercel.json`.
- No English copy changed as a side effect.

## Status (infrastructure + draft translation shipped, not published)

Phase 0 (infrastructure) and Phase 2 (Hebrew content minus HeroDemo) of the design doc's §8 rollout
table are implemented and committed. Phase 1 (the HeroDemo RTL/direction-of-motion decision, §4.2) and
Phase 3 (translating HeroDemo itself) were deliberately **not** attempted - see below. What shipped:

- `documentationHomePath(locale)` (`src/i18n/documentationLocales.ts`), the `localizedHome` content
  collection (`src/content.config.ts`) and `src/i18n/localizedHome.ts` (the same
  status/reviewer/reviewedAt/sourceHash gate as `localizedTools`/`localizedPages`), and the new route
  `src/pages/[locale]/index.astro`.
- The H1/`homeContent` drift is fixed: `homeContent.js` now carries real `h1`/`h1Accent`/`subhead`
  fields (plus the founder-story/draft-persistence/offline-install/privacy/closing card fields the
  schema needs to hash against), and both `index.astro` and the new route render through them via a new
  shared `src/layouts/HomePageLayout.astro` (the same "thin page file over a shared layout" shape
  `ToolPageLayout.astro` already uses) instead of two near-duplicate `.astro` files.
- `AppBar`/`Footer` are wired with `labels`/`variants`/`locale` on both home routes (previously called
  with no props at all - CLAUDE.md/the design doc's §2 row 5/20).
- `FileDropzoneMessages`/`RecentFilesMessages` (`src/i18n/toolMessages.ts`) plus an additive `messages`
  prop on `FileDropzone.tsx`/`RecentFiles.tsx`, defaulting to English so every other caller is
  unaffected. The practice-document caption's destination name is parameterized (`toolDisplayName` prop)
  rather than hardcoded "Sign & Fill" - the localized route resolves it from `/he/sign/`'s own
  `toolName` when published.
- `sitemap.xml.js` has a `homeAlternates()` (modeled on `toolAlternates`) and a home-edition entry, both
  gated on `status === 'published'` - `/he/` is **not** in the sitemap or alternates while it is a
  draft, matching every other page family's rule.
- Two AppBar bugs found live on pdkef.com, fixed for every page (not just home): the hover-reveal back
  arrow now mirrors under `dir="rtl"` (a `.rtl-flip` CSS class, not an inline `style=`, driven by a new
  `locale` prop), and the brand/back link now points at `documentationHomePath(locale)` instead of a
  hardcoded `/`, wired through from every AppBar caller.
- `src/content/localized-home/he.yaml`: a full Hebrew translation of every field, `status: draft`.

**Deliberately deferred, and why:**

1. **HeroDemo stays in English inside the Hebrew page**, with an isolation notice (reusing the
   `toolControlsEnglishNotice` convention as a new `heroDemoEnglishNotice` shell-message key) rather
   than a translation or an RTL mirroring attempt - §4.2's direction-of-motion question (does the demo's
   physical `translateX()` motion mirror for RTL, stay LTR, or get skipped) is still unresolved and is
   explicitly out of scope for this pass. The notice sits in `.hero-header`, below the H1/subhead, not
   inside the sticky-pinned `.home-frame`/`.demo-track` structure - CLAUDE.md's CLS invariants make that
   structure's height math load-bearing (the exact 1116svh scroll span), and this was the placement that
   could not disturb it.
2. **Tool-dock mirroring is untouched.** No RTL override was added for `.home-dock`'s icon order; CSS
   flexbox's automatic RTL mirroring applies with zero code changes, per §4.1's own finding. Whether a
   mirrored dock is actually correct for a UI element meant to read as a fixed "macOS dock" position is
   still an open product question - review this visually on `/he/` before publishing.
3. **Native review of the Hebrew copy.** `he.yaml` is an AI-produced draft (this session), not a native
   review - CLAUDE.md is explicit that "AI drafts are not native review." `status: draft` reflects this;
   the page previews at `/he/` (noindex) when built with `PDKEF_DOCS_PREVIEW=1`, same as every other
   draft tool/content page, but is excluded from the sitemap, alternates and indexing until reviewed.

**What "done" means right now:** infrastructure-complete and previewable, not published or live. Before
flipping `status: published` in `he.yaml`: (1) a native Hebrew speaker reviews the copy for voice and
accuracy and fills in `reviewer`/`reviewedAt`; (2) a product decision on HeroDemo's RTL treatment
(§4.2); (3) a product decision on whether the tool dock's automatic RTL mirroring (§4.1) is the wanted
behavior, or needs an explicit override.

**Known gap, still not fixed here** (see the "Known gap to fold in" note above): the home page's
Markdown twin (`index.md.ts`) has no locale-aware equivalent, so `Accept: text/markdown` on `/he/` falls
through to the `/404.md` fallback, same as before this ticket - this was already flagged as broader than
one page's scope and stays that way.
