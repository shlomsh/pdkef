---
id: "LOC-13"
title: "Spanish pilot: one target-size compress page for Mexico, on the niche this domain already wins"
status: "open"
priority: "P2"
epic: "localized-search"
phase: "near-term"
depends_on: ["LOC-10", "LOC-11"]
legacy_state: "Open"
---

# LOC-13 · Spanish pilot: one target-size compress page for Mexico, on the niche this domain already wins

## Why this page and not `/es/compress/`

[LOC-11](LOC-11.md) measured it: Mexico searches `comprimir pdf` at about 13x `compress pdf` and `unir
pdf` at about 20x, so the demand gate is cleared by a distance. The same SERPs show why a translated
tool page would still lose: iLovePDF (a Spanish company), Smallpdf (511k reviews), PDF24, Adobe and
Canva own `comprimir pdf` natively, and UnePDF already sits at position 3 on `unir pdf` with "tus
archivos nunca salen de tu dispositivo", so even the on-device claim is taken. That is the field this
domain loses to in English at position 36 ([LOC-07](LOC-07.md)).

What the majors do not build is the target-size page. The `comprimir pdf` related-searches block
carries `Comprimir PDF a 1mb`, `Comprimir PDF a 2MB`, `Comprimir PDF a 2MB gratis`, `Comprimir PDF al
máximo`. In English, target-size compression is this domain's best-converting query (`file compressor
to 100kb`, position 9.4, 4 clicks / 100 impressions in 28 days) and the page behind it,
[SEO-17](SEO-17.md)'s `/pdf-wont-compress-to-100kb/`, is the model: it teaches which portals impose
the number, cites each limit, and states the awkward fact that a ten-page scan cannot reach it. This
ticket builds the Mexican counterpart. Spanish first because it is the easiest language to source a
paid native reviewer for (criterion 3), and Mexico because it is the site's 16th country already.

## Rules that carry over unchanged

- **The number has to be real.** Every portal limit on the page is cited to the portal's own page,
  captured with a date. Candidates to verify, not to assume: SAT (buzón tributario and trámites),
  IMSS, INFONAVIT, SEP / UNAM / IPN admissions, becas Benito Juárez, INE, CURP/RFC procedures, state
  civil registries. An uncited limit does not go on the page; a wrong number is worse than no page.
- **The awkward fact stated in the body:** a scanned multi-page document cannot reach 1 MB and stay
  legible; what to do instead (split, fewer pages, ask whether the portal takes more).
- **No doorway.** One page for Mexico's actual limits, not one page per megabyte. If the research finds
  that 1 MB, 2 MB and 4 MB are all real limits on different portals, they go on the one page.
- **Voice** per CLAUDE.md, in Spanish: explain, don't compete; no named competitors; plain facts.
- **Reviewed before published:** the localized-pages gate (`status: 'published'` needs reviewer,
  reviewedAt, reviewNotes) applies. The reviewer is a paid native Mexican Spanish reviewer, named in
  the front matter. Shlomi does not review Spanish.

## Mechanism: this is a native page, not a translation, and the collection needs to say so

`src/content/localized-pages/` is built for twins: `pageId` names an English content page and
`sourceHash` ties the translation to it, and the sitemap emits `hreflang` alternates that declare the
two equivalent. This page has no English equivalent (Mexico's portals are not India's), so declaring
it a twin of `pdf-wont-compress-to-100kb` would be an `hreflang` lie and would also put the page under
a freshness gate against an English source it does not translate.

Decide and record in this ticket; the recommended shape:

- Extend the `localizedPages` schema with a standalone variant: no `pageId`/`sourceHash`, its own
  slug, the same review gate, no `hreflang` alternates (only a self-referencing canonical), listed in
  the sitemap, and rendered by the existing `[locale]/[contentPage].astro` route.
- Register a Spanish locale. `es-CO` already exists in `src/i18n/documentationLocales.ts`; add generic
  `es` (hreflang `es`, prefix `es`) for this page rather than `es-MX`, so the same page can serve
  Spain, Argentina and Colombia if it ranks there. `src/i18n/localePrefixes.js` mirrors the prefix
  list and its test fails if the two disagree.
- The page links to `/compress/` (English UI) for the tool. Accepted for the pilot: the compress tool's
  target-size mode (`targetKB` in `src/lib/compress.js`) is what the page is about, and a Spanish tool
  island is exactly the generic page this ticket declines to build. If the pilot ranks, a Spanish
  `localized-tools/es/compress.yaml` becomes the follow-up, not the other way round.
- Redirect pair in `vercel.json`, `npm run test:redirects`, `check-css-duplication` re-based only if
  the page count moves it, per the usual rules.

## Term and slug come from the data, not from this ticket

LOC-11's "For Shlomi" section has the Trends and SERP links for the target-size terms
(`comprimir pdf a 1mb`, `a 2mb`, `a 500 kb`, `reducir pdf a 1mb`, `al máximo`). The slug and the H1
follow the term that wins and the limits the research verifies; do not fix them here.

## Acceptance

- Portal limits cited, each with a source URL and capture date, in the ticket and on the page.
- Page reviewed by a named paid native reviewer and published; indexing requested in GSC; the date
  recorded here.
- The standalone-page mechanism decision recorded here with the reasoning, and the schema change
  covered by the existing collection tests.
- **Read at eight weeks after indexing:** impressions and position on the Spanish target-size queries
  in GSC Mexico, and whether any Spanish query has reached the page from Spain, Argentina or Colombia.
  Success: top ten on at least one target-size query in Mexico. Kill: no impressions on any of them,
  same as the English page's own bar in SEO-17.
- No second Spanish page and no second language until that read is in.
