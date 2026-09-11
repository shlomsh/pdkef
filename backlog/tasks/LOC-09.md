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
