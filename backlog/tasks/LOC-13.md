---
id: "LOC-13"
title: "Spanish pilot: one target-size compress page for Mexico, on the niche this domain already wins"
status: "blocked"
priority: "P2"
epic: "localization-pilots"
phase: "near-term"
depends_on: ["LOC-10", "LOC-11"]
legacy_state: "Open"
---

# LOC-13 · Spanish pilot: one target-size compress page for Mexico, on the niche this domain already wins

*Re-filed 2026-09-12* from `localized-search` into `localization-pilots`: held until the English target-size number is big enough that a Spanish fraction of it is readable (LOC-10).

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
to 100kb`, position 9.4, 4 clicks / 95 impressions in 28 days), and it lands on `/compress/`, not on a
content page. [SEO-17](SEO-17.md)'s `/pdf-wont-compress-to-100kb/` is the model for the page shape,
honest target-size, portal limits cited, the miss stated, but that page is not indexed and has no
ranking of its own yet. This ticket builds the Mexican counterpart. Spanish first because it is the
easiest language to source a paid native reviewer for (criterion 3), and Mexico because it is the
site's 16th country already.

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

## Go/no-go data, 2026-09-12 (Shlomi's Trends and SERP screenshots, same day the ticket opened)

**Demand: below Trends' floor.** Chart of the five target-size terms alone (`comprimir pdf a 1mb`, `a
2mb`, `a 500 kb`, `reducir pdf a 1mb`, `al máximo`, `geo=MX`, 12 months): zeros all year with two
one-week blips, the shape Trends draws when a term is too small to clear its threshold. Against
`comprimir pdf` (~65) and `reducir tamaño pdf` (~9), every target-size term reads 0. Spain
(`comprimir pdf` ~74, `reducir tamaño pdf` ~21) is the same shape. For scale, the English niche this
page was modelled on (`file compressor to 100kb`) yields about 100 impressions a month, and that is
already small.

**Field: occupied, and the majors are now entering it.**

| Query (`hl=es&gl=MX`) | Dedicated target-size pages in the top ten |
| --- | --- |
| `comprimir pdf a 2mb` | Zamzar (Google-translated), **Pi7 `comprimir-pdf-a-2mb` ("sin subir archivos")**, 11zon `compress-pdf-to-2mb`; iLovePDF, pdf2go, PDF24, Adobe, PDFgear generic; AI Overview |
| `comprimir pdf a 1mb` | 11zon, Zamzar (translated), Pi7, **Smallpdf `comprimir-un-pdf-a-1-mb-gratis`, dated 24 Jun 2026**; PDFgear names 100kb/200kb/1mb in its snippet; video "Archivos menores a 1 MB en minutos" by **Prepa en Línea-SEP** |
| `comprimir pdf a 500 kb` | **Adobe 500 KB page (translated, 281,831 reviews)**, Zamzar (translated), 11zon, Duplichecker (translated), LightPDF (100KB to 2MB custom), **safelocaltools.com "Comprimir PDF a 500 KB, 1 MB o 2 MB": "comprímelo hasta el tamaño máximo que exige tu portal"** |
| `reducir tamaño pdf a 1mb` | 11zon, Smallpdf 1 MB, Pi7, Zamzar, DocHub; SEP video again |
| `comprimir pdf a 2mb` (`gl=ES`) | 11zon, Pi7, Wondershare `pdf.wondershare.es` 2MB (188,357 reviews), DocHub; related searches add `a 10 MB` |

Same tier of competitor as the English 100kb SERP (11zon, Pi7, Zamzar, LightPDF), where `/compress/`
ranks at 9.4 on the English 100kb query, plus Smallpdf and Adobe now building the pages in Spanish,
plus a local-tools site with the portal-limit angle already written. "A year of authority" overstates
it, the domain launched around 2026-06, about ten weeks before this rank was measured (findings doc
section 3.6); the point stands regardless, the English rank came from the existing tool page, not from
a content page.

**The one verifiable hook found:** Prepa en Línea-SEP, the federal online high school, publishes its
own "files under 1 MB" video, so a 1 MB limit at a Mexican government portal is real and citable. If
this page is built, that is where its number comes from.

**Read:** as scoped, the page would produce a number too small to learn from (the Hebrew problem),
against a paid reviewer and a schema extension. Recommendation to Shlomi: hold until LOC-03's Hebrew
read (2026-11-06) and LOC-12 (2026-11-12), and grow the English base first, since localization
multiplies what the English pages already win. **Decision (Shlomi, 2026-09-12): hold.** The same-day
ranking in LOC-11 put Indonesian ([LOC-14](LOC-14.md)) ahead of Spanish as the in-language candidate,
and the image-to-target-size tool (SEO-19) ahead of both. This ticket unblocks when LOC-14 has run and
LOC-12 has re-read the countries; if Spanish is still the best door then, the page is built as scoped
above, on the SEP 1 MB hook, and covers the photo limit as well as the PDF limit.

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
