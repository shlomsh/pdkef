---
id: "LOC-15"
title: "Indonesian pilot: one page for getting a PDF under 1 MB and a photo under 200 KB, on the size-limit family that cleared the gate"
status: "open"
priority: "P1"
epic: "localization-pilots"
phase: "near-term"
depends_on: ["LOC-14"]
legacy_state: "Open"
---

# LOC-15 · Indonesian pilot: one page for getting a PDF under 1 MB and a photo under 200 KB, on the size-limit family that cleared the gate

*Re-filed 2026-09-12* from `localized-search` into `localization-pilots`: gate passed at 1 MB (LOC-14); next is reviewer sourcing and portal-limit research.

## Why this page and not `/id/compress/`

[LOC-07](LOC-07.md)'s field lesson stands unchanged for generic pages: `compress pdf` and `merge pdf`
in Indonesian are the majors' field (iLovePDF, Smallpdf, Adobe, PDF24, Canva at 300k to 700k reviews
each), and this domain's own English `/merge/` sits at position 36 against that same field. Nothing in
[LOC-14](LOC-14.md) changes that reading; a generic `/id/compress/` stays held.

What LOC-14 found is narrower and different: at the 1 MB limit, Indonesian is not just present, it is
the largest validated keyword family measured anywhere in this epic. Keyword Planner puts `kompres pdf
1 mb` at 50,000 searches a month with 40-plus close variants at 500 to 5,000 each, against the English
pages' entire Indonesian footprint of 151 impressions a quarter (GSC, 3 months). Trends confirms a
steady line at that limit, roughly 4% of generic `kompres pdf` and roughly half of bare `pdf 1 mb`,
native beating English about 12x. This is a niche, not the generic field, and the field at that niche
is a second tier this domain already beats in English (Pi7, 11zon, Zamzar, LightPDF, FreeCompress),
where `/compress/` ranks 9.4 on `file compressor to 100kb`. That is the opening LOC-13 (Spanish) looked
for and did not find; Indonesian, at 1 MB only, does.

## Term, slug and H1

Lead with **"di bawah 1 mb"** ("under 1 MB"), not "jadi 1 mb" ("to 1 MB"): Keyword Planner shows the
"under 1MB" family (`di bawah 1 mb`, `kurang dari 1 mb`, `dibawah 1 mb` variants) growing +900% YoY
while the flat "to 1MB" phrasing is flat or down. The exact H1 and slug are chosen by the native
reviewer from this measured family, not fixed here.

**Not the door:** `ukuran file lamaran kerja` ("job application file size"). Its SERP (LOC-14 SERP 5)
is career advice (Jobstreet, Glints, Scribd, HR blogs), not a tool SERP; the 1 to 2 MB figure it
surfaces is an email/HR convention, not a portal cap. The one tool-shaped phrasing inside that cluster,
`mengecilkan ukuran file pdf untuk lamaran kerja`, is a related term to note in the body, not a page to
chase.

## What the page covers

- **The PDF under 1 MB.** The 50,000/month `kompres pdf 1 mb` intent and its variants; this is the
  page's reason to exist.
- **The photo under 200 KB, on the same page.** `kompres foto 200 kb` and its variants run 5,000/month
  each in Keyword Planner, Trends reads it as isolated spikes rather than a steady line, and it is one
  form with the PDF intent, not a second page. Links to `/compress-image/` (SEO-19) for the tool.
- **PDF at 200 KB, as a section, not a page.** The PDF-specific 200 KB variants (`mengecilkan pdf 200
  kb`, `kecilkan pdf 200kb`, `memperkecil ukuran pdf 200 kb`) sum to roughly 2,000 to 2,500/month,
  real but below the "few thousand = a page" line on its own; it earns a section on this page, not a
  URL.
- **The SEO-17 shape.** Real files run through the shipped tool (`compressPdfToTarget`, the compress
  island's target-size mode) at the sizes the page claims, an honest miss stated where compression
  cannot hit the target, and every portal limit cited to the portal's own page.

## Rules that carry over unchanged from LOC-13

- **The number has to be real.** Every portal limit is cited to the portal's own page, captured with a
  date. Candidates to verify, not assume: SSCASN/BKN CPNS document limits, SKCK, PPPK, university
  admissions (SNPMB and similar), Kartu Prakerja. The job-application convention of 1 to 2 MB from
  LOC-14 SERP 5's AI Overview is **not** a portal cap and must not be presented as one. An uncited
  limit does not go on the page.
- **The awkward fact, stated in the body.** Where a scanned or multi-page document cannot reach the
  target and stay legible, say so and say what to do instead.
- **No doorway.** One page for Indonesia's real limits, not one page per megabyte.
- **Voice** per CLAUDE.md, in Indonesian: explain, don't compete; no named competitors; plain facts.
- **Reviewed before published:** a paid native Indonesian reviewer, named in the front matter. Shlomi
  does not review Indonesian.

## Mechanism

The standalone localized-page variant LOC-13 designed: no `pageId`/`sourceHash` twin, its own slug,
the same review gate (reviewer, reviewedAt, reviewNotes), no `hreflang` alternates, a self-referencing
canonical, listed in the sitemap, rendered by the existing `[locale]/[contentPage].astro` route.

- Register an `id` locale: it is not yet present in `src/i18n/documentationLocales.ts` or
  `src/i18n/localePrefixes.js` (only `he` and `es-co` are registered today). Both files must agree, the
  prefix test (`localePrefixes.test.js`) fails if they disagree.
- The page links the English tools, `/compress/` and `/compress-image/`, for the mechanism. An
  Indonesian tool island is the generic-page move this ticket declines, same reasoning as LOC-13.
- Redirect pair in `vercel.json`, `npm run test:redirects`.
- The CSS duplication ratchet must be narrowed, not re-based, when the page lands: the 2026-09-12
  narrowing left 13 bytes of headroom at 39 pages, so this page needs the narrowing done alongside it,
  not a ratchet bump.

## The translated-results caveat

Indonesia is on Google's translated-results list (LOC-08's reading applies here too): the English
`/compress/` and `/compress-image/` already reach these searchers through Google's own translation, in
every SERP LOC-14 captured. The native page has to beat that translation, not just exist, which is why
it has to carry content those English pages do not: Indonesian portal limits and Indonesian-run
measured files. A page that only translates the English copy adds nothing Google was not already
serving.

## Field, for the record

No SERP LOC-14 read is thin. The dedicated target-size pages are the same second tier this domain
ranks against at 9.4 in English (Pi7, 11zon, Zamzar, LightPDF), plus FreeCompress and a native blog
already in this page's shape (easypdf.fr, 18 Aug 2026, "Kompres PDF ke 1 MB Gratis: 5 Jenis Dokumen
Diuji"). The majors hold the generic slots and the AI Overview. No result in any of the five SERPs
claims on-device processing. Expected start: page two, a slow climb, not a fast win.

## Acceptance

- Portal limits cited, each with a source URL and capture date, in this ticket and on the page.
- Reviewer named and paid in the front matter; the page published; indexing requested in GSC, dated
  here.
- **Read at eight weeks after indexing:** impressions and position on the `kompres pdf 1 mb` /
  `di bawah 1 mb` family in GSC Indonesia. Success: top ten on at least one of them. Kill: no
  impressions on any of them, same bar as the English page's own in SEO-17.
- No second Indonesian page and no second language until that read is in.
- The languages page (`docs/i18n-status/`) updated at each stage change.
