---
id: "LOC-10"
title: "Keep or remove page localization: decide after LOC-11 has measured the top languages"
status: "done"
priority: "P1"
epic: "localized-search"
phase: "near-term"
depends_on: ["LOC-11"]
legacy_state: "Done 2026-09-12"
---

# LOC-10 · Keep or remove page localization: decide after LOC-11 has measured the top languages

## Status: decision deferred (Shlomi, 2026-09-12)

The case for removal below was made and accepted on 2026-09-12, and a removal agent was started.
Shlomi stopped it the same hour: "we might have come to a conclusion too fast. Let's not be hasty with
removing anything and spend more time on research before we make the final decision." Nothing was
removed; the agent had not committed. This ticket now holds the decision, and it is **blocked on
[LOC-11](LOC-11.md)**, which measures the top languages behind the site's top twenty countries
(Vietnamese, Turkish, Spanish, Italian, Arabic, Filipino, Bengali, Urdu). The cost side below is
measured and does not change; the demand side is what LOC-11 adds.

## Decision: keep (Shlomi, 2026-09-12)

"Keep it." The mechanism, the three Hebrew tool pages and the seven Hebrew guides all stay as they
are. The maintenance cost below is accepted knowingly, on the strength of LOC-11's finding that
in-language search is the norm in most of the site's top countries, not the exception. What follows
from it: no generic tool page gets localized into a new language (that field is lost in every language
measured); the next localization work is [LOC-13](LOC-13.md), one Spanish target-size compress page;
Hebrew reads at LOC-03's date and LOC-09 waits for it; [LOC-12](LOC-12.md) re-checks the countries on
2026-11-12. The removal plan below stays as the record of what a removal would touch, should LOC-12
ever call for it.

**LOC-11 reported the same day, and the demand premise below is refuted.** Vietnam, Turkey, Mexico
and Italy search natively at 6x to 20x the English term; India, Israel, Malaysia and the UAE are the
exceptions the "tens of impressions" ceiling was generalised from. The field premise holds (every
native SERP is the majors, natively, with the on-device claim already taken by a local site in three
of them). Recommendation in LOC-11: **keep the mechanism, do not localize generic tool pages, pilot
one localized target-size compress page in one strong market.** Confirmed above.

## The case for removal, as made on 2026-09-12

**What was measured.** Israel in GSC: 8 clicks from 20 impressions in three months, all English
queries. Trends put Hebrew at about a third of English on merge, near zero on sign, sporadic on
compress and pdf-to-jpg ([LOC-01](LOC-01.md)). Hindi, Malay, Telugu and Tamil: flat at zero on every
instrument ([LOC-01](LOC-01.md), [LOC-08](LOC-08.md)). Indonesian was the one language with real
in-language volume, and it was declined on field: the `hl=id` SERP is owned by iLovePDF, Smallpdf,
Adobe, PDF24 and Canva at 300k-700k reviews each, a field this domain loses to in English at position
36 ([LOC-07](LOC-07.md)). The best case for `/he/` is tens of impressions a quarter.

**What it costs.** Measured on `main` at `464a067`: about 2,000 lines of mechanism (`src/i18n/`,
`src/pages/[locale]/`, `scripts/localizedSeoChecks.mjs`, `e2e/localized/`), 1,062 lines of Hebrew
YAML, and touches in roughly 30 shared files. The recurring part is what decides it:

- The freshness gate (`src/i18n/documentationFreshness.ts`) turns every English copy edit on the ten
  localized pages into a build failure until the Hebrew is re-reviewed. Those pages are `/compress/`,
  `/merge/`, `/sign/` and the guides, which is where the search-acquisition epic iterates copy. The
  highest-leverage work in the backlog pays a tax to serve the smallest market.
- Every new island string needs a Hebrew twin (MOBI-09 paid this).
- It produced a bug class English never had: pdf.js inheriting `dir="rtl"` into the canvas on
  `/he/sign/` (fixed in `1a7b5d4`, and it broke CI on `main` on the way).
- The CSS duplication ratchet had to be raised from 7.75x to 9.00x on page count alone; the redirect
  list, sitemap and CLAUDE.md all grew.
- "Reviewer available" made Hebrew look free to build. It is not free to keep: the reviewer is
  Shlomi, on every English edit, indefinitely.

**Why remove rather than freeze.** The mechanism is binary. If one Hebrew page stays, the route, the
gate, the hashing, the RTL shell, the switcher, hreflang, the i18n islands and the e2e specs all stay.
Waiting for LOC-03's eight-week read (2026-11-06) pays the tax during the wait to learn a number whose
ceiling Trends and GSC already drew. If a language ever clears the bar in [LOC-11](LOC-11.md), the
mechanism is in git history at `464a067` and was a few days of work; restoring it then is cheaper than
carrying it for months on the chance.

## Scope, if the decision is remove

**Delete.**

- `src/pages/[locale]/` (both routes) and any `.md.ts` twins for localized pages.
- `src/content/localized-pages/` and `src/content/localized-tools/`, plus their collections and the
  publish gate in `src/content.config.ts`.
- `src/i18n/` in full, except what the keep-list below says about the island message tables.
- `src/components/DocumentationLanguageSelector.astro`, `src/components/LocalePackRequest.astro`, and
  every localized branch in the layouts, cards and islands that only exists to render a non-English
  edition (`BaseLayout`, `ToolPageLayout`, `ContentPageLayout`, `ContentPage`, `AppBar`, `Footer`,
  `ToolAboutCard`, `ToolCrossLinks`, `OtherGuides`, `RelatedGuides`, `ToolShell`, `BasePdfTool`,
  `DropzoneEmptyState`, the three localized tool islands). Read each file before editing; the RTL
  handling inside the editor is not localization (see keep-list).
- `hreflang` alternates and `x-default` from `src/pages/sitemap.xml.js`; the localized checks in
  `scripts/verify-seo.js` and `scripts/localizedSeoChecks.mjs`; the locale exclusions in
  `scripts/precacheFilter.mjs`; the locale awareness in `src/lib/gitLastModified.js` and
  `scripts/check-page-weight.js` / `scripts/check-css-duplication.js` if any.
- `e2e/localized/` (both specs) and the `src/lib/localizedSeoChecks.test.js` and `src/i18n/*.test.*`
  suites.
- The RTL shell CSS (page-level `dir`/`[dir="rtl"]` rules for the marketing shell and the tool page
  chrome). Not the editor's.
- The localization sections of `CLAUDE.md`, replaced by one paragraph: what was measured, that the
  code was removed, and a pointer to `docs/seo-competitive-findings.md` and this ticket.
  `docs/home-page-localization-plan.md` gets a one-line header noting it describes removed
  infrastructure, and stays as a record.

**Redirect.** Every `/he/` URL that was live gets a permanent redirect to its English sibling, in
`vercel.json`, both slash forms: `/he/compress/`, `/he/merge/`, `/he/sign/`, and the seven guides
(`how-to-sign-a-pdf-on-{android,iphone,mac,windows}`, `install-pdf-app`, `open-source-pdf-editor`,
`sign-pdf-no-signup`). `npm run test:redirects` must pass; a retired route's redirect is what keeps the
indexing requests made on 2026-09-11 from resolving to 404s.

**Keep. Do not touch these.**

- Everything under `src/editor/`: bidi, RTL text boxes, Hebrew and every other script's fonts, shaping
  guards, `comb.js`, `textCoverage.js`. That is the product (Hebrew inside the PDF), not localization
  (Hebrew around it). `isRtl`/direction logic in `DraggableWrapper`, `TextNode`, `FontSupportNotice`
  and `useElementResize` belongs to this group.
- `src/editor/adapters/pdf/renderContext.js` forcing `ltr` on every pdf.js canvas, and its test. It
  is correct hardening for detached canvases regardless of page direction.
- The non-Latin query clustering in `scripts/seoRefreshLib.mjs` (the `\p{Script=...}` detection).
  It is the instrument LOC-11 uses to notice in-language demand appearing in GSC. Drop the
  locale-prefix page grouping and `PILOT_COUNTRY_BY_PREFIX` if they only make sense with localized
  pages; keep the script detection and its tests.
- The island message tables (`toolMessages.ts`, `cardMessages.ts`): if flattening to plain English
  strings costs more churn than a single-locale table, keep the table with English only. Either is
  acceptable; do not leave a dead `he` branch.
- `src/lib/format.js` locale-aware number formatting, if it is used by English pages.

## Acceptance, if the decision is remove

- `npm run build`, `npm test`, `npm run typecheck`, `npm run test:redirects`, `npm run test:css`,
  `npm run check:backlog` all green; `npm run test:e2e` green with `e2e/localized/` gone.
- No file under `src/` references `/he/`, `localized-pages`, `localized-tools`, `documentationLocales`
  or `hreflang` (grep, not memory).
- The CSS duplication ratchet in `scripts/check-css-duplication.js` is re-based downward to the
  measured value, with the dated note updated. Ratchets only go down.
- `curl -sI https://pdkef.com/he/sign/` returns a 301 to `/sign/` after deploy (verify on production;
  `vercel.json` redirects do not run in preview).
- LOC-03, LOC-05 and LOC-09 retired with a one-line pointer here; LOC-02 and LOC-06 get an outcome
  addendum saying what happened to what they built. The findings doc's status board rows updated;
  section 2 gains the ROI gate written in LOC-11. [LOC-12](LOC-12.md) stays open as the scheduled
  re-check.
- Nothing in `src/editor/` changes. `git diff --stat main -- src/editor/` is empty.

## If the decision is keep

Then the maintenance cost is accepted knowingly, and two things follow: the freshness gate stays a
build error (a stale published Hebrew page is worse than none), and LOC-09 (the Hebrew home page)
and any new language go through LOC-11's ROI gate first. Record the reasoning here either way.

## Handoff notes (removal)

Work from the grep, not from memory: `grep -rn -E "locali[sz]ed|i18n/|hreflang|documentationLocales|/he/" src scripts e2e vercel.json astro.config.mjs` is the starting list, and every hit is either deleted, or kept for a reason named in the keep-list. When a shared file has both a localization branch and something else, remove only the branch. The build is the judge: `check-dead-utilities.js` will name any class left behind by removed markup, and `verify-seo.js` will fail on a sitemap entry with no page.
