---
id: "LOC-09"
title: "Localize the home page, so /he/ is a real edition and not a 404 beside three Hebrew tool pages"
status: "done"
priority: "P3"
epic: "localized-search"
phase: "later"
depends_on: ["LOC-03", "LOC-05"]
legacy_state: "Done 2026-09-12"
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

- `/he/` renders as a real, RTL-correct, indexable edition of the home page.
- The switcher on every Hebrew page links to `/he/` and the English home page lists the Hebrew edition;
  `hreflang` reciprocal with `x-default`, `verify-seo.js`'s localized guards passing on the new route.
- The home page's CLS and first-paint invariants (one canonical DOM reshaped by CSS, no re-parenting,
  the launcher's viewport-derived height) are preserved on the Hebrew edition and checked in a real
  browser, since the RTL grid is the change most likely to disturb them.
- `npm run build && npm run preview` CSP pass; `test:seo`, `test:css`, `test:weight`, `test:redirects`
  green; the non-slash redirect pair for `/he` added to `vercel.json`.
- No English copy changed as a side effect.

## Status (shipped: /he/ is live from the start, not gated behind a draft/preview step)

**As of 2026-09-12 (`7ccd746`):** `/he/` is live, indexable and RTL-correct. The tool dock is fully
Hebrew - all ten tool cards render title, description and, where a Hebrew edition exists, a Hebrew-page
href, through `getToolCardCopy(locale, slug)` (`src/i18n/cardMessages.ts`), backed by a unit test that
fails if a `tools.js` slug or a `contentPages.js` href has no Hebrew card. Every tool and guide card on
the page is Hebrew as a result; measured whole-page script purity, excluding the disclosed-English
HeroDemo exemption, is **0.906**. The Sign editor's toolbar row is Hebrew too - stage 1 of localizing
the island: Text, Symbols, Shapes, Whiteout, Sign, Undo, Feedback, view density, Replace, Share,
Download and the tip line all read in Hebrew, and the row mirrors under RTL (tools on the right,
Download on the left) - Shlomi's own decision, made after judging it on the built page. Still English
inside the Sign editor: the Shapes menu, the signature popover, the signature and undo dialogs, the page
header, the selected-element toolbar, the screen-reader announcements, and the GitHub feedback template
(English by decision - issues are triaged in English). Because those surfaces are not yet translated,
`sign` stays outside `LOCALIZED_TOOL_ISLANDS` (`src/i18n/localizedTools.ts`, currently
`new Set(['merge', 'compress'])`) - that set gates which tool islands claim to be fully localized, and
Sign's inventory is only about 40 of its roughly 136 strings done so far.

Phase 0 (infrastructure) and Phase 2 (Hebrew content minus HeroDemo) of the design doc's §8 rollout
table are implemented and committed. Phase 1 (the HeroDemo RTL/direction-of-motion decision, §4.2) and
Phase 3 (translating HeroDemo itself) were deliberately **not** attempted - see below. What shipped:

- `documentationHomePath(locale)` (`src/i18n/documentationLocales.ts`), the `localizedHome` content
  collection (`src/content.config.ts`) and `src/i18n/localizedHome.ts`, and the new route
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
  `toolName`.
- `sitemap.xml.js` has a `homeAlternates()` (modeled on `toolAlternates`) and a home-edition entry, both
  filtered on `status === 'published'` for shape parity with every other page family - see the
  no-draft-path note below for what that filter does and does not mean here.
- Two AppBar bugs found live on pdkef.com, fixed for every page (not just home): the hover-reveal back
  arrow now mirrors under `dir="rtl"` (a `.rtl-flip` CSS class, not an inline `style=`, driven by a new
  `locale` prop), and the brand/back link now points at `documentationHomePath(locale)` instead of a
  hardcoded `/`, wired through from every AppBar caller.
- `src/content/localized-home/he.yaml`: a full Hebrew translation of every field, `status: published`.

Seven more commits landed since that pass, four on `main` and three on this branch:

- **The tool dock is Hebrew now** (`c33a404`). The nine, now ten with Compress Image, dock labels and
  tooltip sentences were English regardless of locale (this is the old deferred item 3, resolved -
  see below). Fixed by reusing `ToolCrossLinks.astro`'s own localization path instead of extending
  `TOOL_SOURCE_FIELDS`: `getToolCardCopy(locale, slug)` for the title/description,
  `documentationPath(slug, locale)` for the href when that tool has a published Hebrew edition. Sign,
  Merge and Compress link to their Hebrew editions from the Hebrew dock; the rest still link to the
  English page, same as the cross-link cards elsewhere. The same commit fixed `<AppBar isHome
  locale={locale}>` never receiving `labels`, which had silently rendered the "On-device" trust badge in
  English on the Hebrew home page while the identical component read "עובד מקומית" on every Hebrew tool
  page.
- **Shlomi's own live copy review** (`9eb5984`) edited four Hebrew strings directly on `main`: the H1's
  emphasis on "only" (אך ורק), the MIT trust chip leading with "open source" rather than the licence
  name, a shorter GitHub star ask, and Compress's pre-file placeholder. `he.yaml`'s own
  `reviewer`/`reviewedAt`/`reviewNotes` fields were not touched by this pass - see the still-open list
  below.
- **The Hebrew hero caption has its own handwriting font** (`f67e6bc`). It previously fell back to the
  generic `cursive` keyword because the bundled 'Caveat Demo' face is Latin-only. Gveret Levin, already
  bundled and OFL-credited as the editor's own Hebrew handwriting fallback, is now subset the same way
  Caveat Demo is and declared as 'Gveret Levin Demo' for the Hebrew caption, with adjusted
  size/weight/tracking to match the English caption's visual weight. Only the current locale's caption
  font is preloaded per page.
- **`TrustChips.astro`** (`75c3c1b`) now owns the three trust chips on every page. Home and tool pages
  rendered the same `AppBar` but different chip CSS - home's own `.home-trust .trust-chip` rules
  out-specified an older copy in `AppBar.astro` - so a tool page's chips differed from home's by border
  width, padding and badge tint; both now match to 0.1px on `/` and `/merge/`, and the licence chip
  reads "Open source" instead of the licence name. The same commit carries several LOC-09 review fixes:
  the `/he/` launcher now hands a dropped file to `/he/sign/`, not the English `/sign/`; Sign's replace
  confirmation on `/he/sign/` no longer says "your annotations" mid-sentence (`signWorkNoun` in the shell
  catalogue); the install tabs use logical `me-`/`border-s-` properties so their icon margin and active
  indicator mirror under `dir="rtl"`; the brand link, tool dock and tablist got Hebrew `aria-label`s; and
  the CSS duplication limit came down from 9.45x to 9.39x at the time.
- **Hebrew cards for Compress Image and its guide, plus review fixes** (`18b1f06`). The Hebrew card
  table in `cardMessages.ts` predated the Compress Image tool (SEO-31) and its guide, so the tenth dock
  button and the third guide card on `/he/compress/` were still English. Both now have entries, and
  `src/i18n/cardMessages.test.ts` asserts every `tools.js` slug and every `contentPages.js` href has a
  Hebrew card, so a future tool or guide cannot ship an English card on a Hebrew page unnoticed.
  **Measured purity of `/he/`, excluding the disclosed-English HeroDemo: 0.906, up from 0.682** - the
  dock text was most of that remaining gap. The same commit carries three fixes from Shlomi's review:
  the Compress Image card drops the "no daily cap" tail (only the two Compress cards had it, the other
  eight do not), the `/he/compress/` subhead's "פרטי:" becomes "פרטי.", and the airplane-mode line on
  Sign/Redact now hangs off the tool card's trailing edge (left in RTL, right in LTR) instead of
  sitting centred between the subhead and the dropzone; measured at 1400px, its text edge is 84 on
  `/he/sign/` and 1316 on `/sign/`, both equal to the card's edge.
- **The Sign editor toolbar is Hebrew, stage 1 of localizing the Sign island** (`ab92ce7`). The toolbar
  row on `/he/sign/` - Text, Symbols, Shapes, Whiteout, Sign, Undo, Feedback, view density, Replace,
  Share, Download, and the tip line - now reads in Hebrew, through a new `SignMessages` catalogue in
  `toolMessages.ts` built the same way Merge's and Compress's are: English values verbatim from source
  (so `/sign/` and every existing test are unchanged) plus a Hebrew object marked as an AI draft pending
  review. Left English on purpose: the Shapes menu, the signature and undo dialogs, the page header, the
  selected-element toolbar, the screen-reader announcements (the four templates are in the catalogue but
  not yet wired), and the GitHub feedback template, which stays English because issues are triaged in
  English. The toolbar's previously hardcoded `dir="ltr" lang="en"` now comes from the catalogue, so the
  row mirrors under RTL - tools on the right, Download on the left; Shlomi judged it on the built page
  and kept it. Two incidental fixes landed alongside: Sign's own Replace control now reads the shell message
  catalogue through `useToolShell()` instead of the hardcoded `FILE_ACTIONS` label, and the "Delete signature?" confirmation now
  gets real Cancel/Close labels instead of English shell defaults. Inventory: about 136 strings across
  five surfaces; this stage covers the roughly 40 in the toolbar row.
- **The airplane-mode line's wrapper div was a second app-bar locator match** (`7ccd746`).
  `tool-layout.spec.js` locates the app bar by `body > div > div`, and the notice's box classes moved
  from a wrapper div onto the `<p>` itself (`w-full` keeps it from shrink-to-fit) so the locator stays
  unique. Re-measured at 1400px: text edge still 84 on `/he/sign/`, matching the card's own edge.

**No separate draft/noindex-preview step, by explicit decision.** `[tool].astro`/`[contentPage].astro`
gate a translation behind `status: draft` + `PDKEF_DOCS_PREVIEW=1` + a noindex preview banner before it
ever ships as a real page. Shlomi asked, mid-implementation, to skip that step here: `he.yaml` is
`status: published` from the start, `/he/` builds and indexes in every ordinary build (no env flag), and
`src/i18n/localizedHome.ts`/the route carry none of the preview/noindex branching the other two
collections have (see that module's header comment - not a bug, a deliberate simplification, "not
backward compatible with that pattern is fine" were his words). `reviewer`/`reviewedAt`/`reviewNotes`
are still present on `he.yaml` for shape parity with the three published Hebrew tool files, but
`reviewNotes` says plainly that this is an AI draft pending Shlomi's own read-through of the rendered
page, not a native review that already happened - nothing here claims otherwise, and nothing about this
file publishing to `main` pushes it to production without his separate sign-off.

**Deliberately deferred, and why:**

1. **HeroDemo stays in English inside the Hebrew page**, with an isolation notice (reusing the
   `toolControlsEnglishNotice` convention as a new `heroDemoEnglishNotice` shell-message key) rather
   than a translation or an RTL mirroring attempt - §4.2's direction-of-motion question (does the demo's
   physical `translateX()` motion mirror for RTL, stay LTR, or get skipped) is still unresolved and is
   explicitly out of scope for this pass. The notice sits in `.hero-header`, below the H1/subhead, not
   inside the sticky-pinned `.home-frame`/`.demo-track` structure - CLAUDE.md's CLS invariants make that
   structure's height math load-bearing (the exact 1116svh scroll span), and this was the placement that
   could not disturb it. Because the demo's own English text is substantial server-rendered content, it
   also needed a targeted exclusion added to `scripts/localizedSeoChecks.mjs`'s language-purity guard
   (the same disclosed-English exception `[data-tool-controls-english]` already gets, extended to
   `[data-home-demo]`) - without it a fully-translated `/he/` still failed `verify-seo.js` on purity
   alone.
2. **Tool-dock mirroring is untouched.** No RTL override was added for `.home-dock`'s icon order; CSS
   flexbox's automatic RTL mirroring applies with zero code changes, per §4.1's own finding. Whether a
   mirrored dock is actually correct for a UI element meant to read as a fixed "macOS dock" position is
   still an open product question - review this visually on `/he/`.
3. **Resolved: the tool dock's text (§9 open question #3).** This item originally read "the tool dock's
   *text* is still English, and it is not disclosed on the page," with a measured whole-page purity of
   0.430 (under the guard's 0.5 floor, passing only via the HeroDemo exemption) and 0.682 with the demo
   excluded. `c33a404` answered §9 #3 by *not* extending `TOOL_SOURCE_FIELDS`
   (`src/i18n/localizedTools.ts`): `tools.js` is client-imported (`RecentFiles` renders from it
   directly), so a Hebrew translation bundle added there would ship to every visitor's browser
   regardless of locale. `cardMessages.ts` keeps the per-locale table out of the client bundle instead,
   the same way `documentationMessages.ts` and `toolMessages.ts` already do, and `ToolCrossLinks.astro`'s
   existing `getToolCardCopy(locale, slug)` path is reused for the dock rather than duplicated. Purity
   excluding the HeroDemo exemption is now 0.906 (`18b1f06`); see the "what shipped" bullets above.
4. **Native review of the Hebrew copy, partial.** `he.yaml` still carries `reviewer: 'Claude Sonnet 5'`
   and a `reviewNotes` saying this is an AI draft pending Shlomi's read-through - that metadata was not
   touched by `9eb5984`, even though `9eb5984` is Shlomi editing four of `he.yaml`'s own strings live on
   `main` (the H1 emphasis, the MIT chip, the GitHub star chip, the Compress placeholder). So there has
   been a real native review pass on part of the file, but the file does not yet say so, and it is not a
   full read-through or sign-off - see the still-open list below. The same caveat still applies to the
   Hebrew `FileDropzone`/`RecentFiles` catalogues in `src/i18n/toolMessages.ts` and to the new
   `SignMessages` Hebrew object (`ab92ce7`), all marked as AI drafts in their own comments.

**Found in review and fixed here, so nobody re-derives them:**

- The HomePageLayout extraction quietly changed two things on the English `/`. The FAQ kicker started
  reading `DocumentationShellMessages.faqTag` ("Got questions?", what every tool and guide page says)
  instead of the home page's own "A few useful answers", and the draft-persistence line's two tool
  names picked up `renderInline`'s `muted` tone where they had always been a bare `<strong>`. Home now
  owns a `faqKicker` field and `renderInline` has an `inherit` tone. `dist/index.html` was diffed
  against a fresh build of `6b4fde2` before and after; the only remaining deltas are the reciprocal
  hreflang links, the footer language switcher and the island props payload.
- The locale's own home page was missing from its offline pack (`getPublishedEditionPaths` unioned
  tool and guide variants only), so an installed Hebrew PWA would have answered `/he/` offline with
  sw.js's `/` fallback - the English shell.
- `getStaticPaths` here took every `localizedHome` entry regardless of `status`. Since this route has
  no preview branch, a draft would have built as an ordinary indexable page that the sitemap and the
  alternates both excluded. Now filtered.
- **`/he/` has no static-hosting or routing problem, despite an earlier report that `astro preview`
  404s on it.** Verified three ways on this branch: `dist/he/index.html` exists with the right
  content, a plain `python3 -m http.server` over `dist/` answers `/he/` `200`, and `astro preview`
  itself answers `/` `/sign/` `/he/` `/he/sign/` `/he/open-source-pdf-editor/` all `200`. The earlier
  404 was the preview daemon reusing a port against another build - the trap CLAUDE.md's Commands
  section already names ("one preview, on 4173, per worktree"). Do not add a Vercel caveat for this.

**What "done" means right now (2026-09-12):** `/he/` is live, indexable and RTL-correct, with a fully
Hebrew dock (ten of ten tool cards, guarded by a unit test) and a measured whole-page purity of 0.906
excluding the disclosed-English HeroDemo. The Sign editor's toolbar row is Hebrew too (stage 1 of 5),
mirrored under RTL by Shlomi's own decision after seeing it built.

**Closed 2026-09-12.** Of the two product decisions this ticket was waiting on, Shlomi made both today:
HeroDemo is to be translated, not left English indefinitely (open question #1, §4.2 - the
direction-of-motion sub-question is still unresolved and moves on with the rest of the work); the tool
dock's automatic RTL mirroring stays as is, no override (open question #2, §4.1). Everything else this
ticket had left open, the `he.yaml` review sign-off, Sign island localization stages 2 to 5, the two
missing compress-hub guides, and the home-page Markdown twin, moves to [LOC-16](LOC-16.md) rather than
staying open here.

**Known gap, still not fixed here** (see the "Known gap to fold in" note above): the home page's
Markdown twin (`index.md.ts`) has no locale-aware equivalent, so `Accept: text/markdown` on `/he/` falls
through to the `/404.md` fallback, same as before this ticket - this was already flagged as broader than
one page's scope and stays that way.
