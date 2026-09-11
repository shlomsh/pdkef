---
id: "LOC-02"
title: "Localized tool pages: the route, the reviewed copy source, and the island message catalogue"
status: "open"
priority: "P2"
epic: "localized-search"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# LOC-02 · Localized tool pages: the route, the reviewed copy source, and the island message catalogue

## Scope and acceptance

**The gap this closes.** The localization infrastructure that exists (`src/i18n/documentationLocales.ts`,
`src/content/localized-pages/`, `src/pages/[locale]/[contentPage].astro`, the `reviewer` /
`reviewedAt` / `sourceHash` gate in `src/content.config.ts`) covers the **how-to guides only**. The
queries with intent land on **tool pages**: `כיווץ מסמך pdf` goes to a compress tool, not to a guide
about compressing. Publishing the Hebrew guides ([SEO-27](SEO-27.md)) does not compete for that query
at all. This ticket makes `/he/compress/` possible with the same rigour the guides already have. It
builds the mechanism once; LOC-03 fills it for the first language.

**Design, decided here so the pilot does not re-open it.**

- **Route.** `src/pages/[locale]/[tool].astro`, generated from a `localizedTools` content collection
  (`src/content/localized-tools/<locale>/<tool>.yaml`) with the *same* frontmatter gate as
  `localizedPages`: `status`, `sourceHash` against the normalized English entry in `src/data/tools.js`,
  and `reviewer` / `reviewedAt` / `reviewNotes` required when published. A draft renders as a
  `noindex` preview; only published entries enter the sitemap and the `hreflang` set. The English
  page stays at the root URL and is `x-default`.
- **What is translated.** Everything the crawler reads: title, description, h1, intro, steps, FAQ
  (mirrored into `<SeoSchema>` as today), the language card on Sign, cross-link cards. FAQ answers are
  translated, not re-authored, so the schema-matches-page guard keeps working.
- **The island is localized too, or the page is not.** Sejda's Hebrew edition has a Hebrew headline
  above English buttons, and that is the exact weakness LOC-01's brief tells the researcher to look
  for. Tool islands take a `messages` prop, server-rendered, with an English default; no runtime i18n
  library, no client-side language detection. For Merge, Split, Compress, Unlock, PDF-to-Image and
  Image-to-PDF that is roughly thirty strings each. **Sign and Redact are the exception for the pilot**:
  the editor's `TOOL_COPY` vocabulary and dialogs are a larger surface, and the 2026-08-28 design
  record ([docs/app-documentation-localization-plan.md](../../docs/app-documentation-localization-plan.md))
  already decided the editor stays English behind a visible "editor controls are in English" notice.
  Keep that decision for the pilot; revisit only if LOC-04 shows Sign is where the localized traffic
  goes.
- **RTL is a layout property of the shell, not of the text.** `<html dir="rtl">` is already plumbed
  through `BaseLayout`; what is not verified is that `ToolPageLayout`, `AppBar`, `Footer`, the FAQ
  disclosures, the cross-link cards and the dropzone all flip. Audit the static shell for physical
  utilities (`ml-`, `pl-`, `text-left`, `left-`) that should be logical (`ms-`, `ps-`, `text-start`,
  `start-`) and convert only what a Hebrew page actually renders. The editor's own RTL behaviour
  (text boxes growing leftward, `top-end` toolbar placement) is a separate, already-shipped concern
  and is out of scope here.
- **Switcher, not redirect.** A visible language selector on every page that has at least one
  published edition, listing only published editions (the design record's rule), in the footer where
  the incumbents put it. No IP or `Accept-Language` redirect, ever: Google crawls from the US and would
  never see the Hebrew page, and a bilingual reader would be sent to the wrong edition.
- **Sitemap and `hreflang`.** `sitemap.xml.js` emits the published localized tool URLs with
  `xhtml:link rel="alternate"` for every edition of that tool plus `x-default`; the page `<head>`
  carries the reciprocal set. `documentationLocales.ts` already records which locale ids are safe
  Google `hreflang` values and which are not (`fil-PH`, `prs-AF`); a locale with `hreflang: undefined`
  gets no annotation rather than a guessed one.

**Delivery: a locale must cost only its own visitors bytes.** Decided 2026-09-11 against the
site's caching model, so the pilot does not relearn it.

- **Path prefix, one origin.** `/he/<tool>/` beside `/<tool>/`, never a subdomain: a second origin
  means a second service worker, cache, IndexedDB and localStorage, so drafts and recents would stop
  carrying between editions and every shared chunk would download twice.
- **Copy travels in the HTML, code is shared.** Each edition is its own prerendered file; the island's
  strings are serialized into its props in that file (1 to 2 KB), and the tool's JS chunk is the same
  content-hashed file the English page loads. No language bundle, no i18n runtime, no second
  stylesheet for RTL (logical properties). Page text uses system fonts; the editor's `@font-face`
  loading is untouched.
- **Localized HTML is excluded from the precache manifest and fetched as a pack.**
  `scripts/precacheFilter.mjs` precaches all of `dist/` except fonts, so `/he/*` would otherwise land
  in every visitor's cache. Exclude `/<prefix>/` HTML there, and have a localized page ask `sw.js` to
  precache its edition's pages the way font packs already work (`fontPackMarker`). A Hebrew visitor
  then has the whole edition offline after one visit, with the JS already in the shared precache;
  an English visitor never fetches it. Small for three pages; the rule is what stops nine tools times
  N languages from compounding.
- **Drafts key by tool id, not by URL.** `ToolPageLayout`'s draft-hint script strips slashes to make
  its slug, so `/he/sign/` becomes `hesign` and the saved-draft hint is missed; use the stable tool
  id (the 2026-08-28 design record flagged this). `draftStore` already keys by tool name, so a draft
  started on either edition restores on both.
- **Out of scope, on purpose:** the precache already downloads every tool's JS for every visitor
  (the whole-shell policy from the SIGN-07 review, 4.23 MB non-font). Localization neither improves
  nor worsens that because the JS is shared; revisiting it is a separate ticket that needs per-page
  dependency lists built from the emitted HTML plus the known dynamic imports.

**Guardrails to add to `verify-seo.js`** (the invariants are CI, not prose):

1. Every localized page's `hreflang` set is reciprocal and includes `x-default`; every URL in it exists
   in `dist/`.
2. `lang` and `dir` on `<html>` match the locale registry.
3. **Language purity**: the share of visible text in the target script on a localized page is above a
   threshold (set it from the first Hebrew page, and record the number). This is the structural check
   against shipping a Hebrew headline over an English tool, which is the failure the incumbents have.
4. No draft localized URL in the sitemap; no published one missing from it.
5. No `/<prefix>/` HTML in `precache-manifest.json` (a test on `shouldPrecache`), and the pack
   request from a localized page names only that locale's published pages.

**Acceptance.**

- `/he/merge/` renders end to end from a draft YAML as a `noindex` preview, with a localized island,
  RTL shell, switcher, and the four guards passing; a sabotage check for each guard (a deliberately
  broken fixture) fails the build.
- `npm run build && npm run preview` CSP pass (the switcher and any notice are static markup; nothing
  `is:inline`); `npm test`, `npm run test:seo`, `npm run test:css` green. The per-page dead-utility
  check will need the new route family added to the right entry stylesheet under ARCH-13's rules.
- Page weight of a localized tool page within the same budget as its English page; the Hebrew fonts
  are system fonts for page text, not the editor's bundled TTFs.
- No English copy changed as a side effect. This ticket adds a route; it does not edit `tools.js`.
