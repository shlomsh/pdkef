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

## Prep, 2026-09-12: portal limits, measured runs, reviewer brief

Nothing built. Three inputs the page needs before a reviewer is hired, so the reviewer gets a
skeleton with real numbers rather than a blank brief. The English skeleton for the reviewer is
[docs/loc-15-reviewer-brief.md](../../docs/loc-15-reviewer-brief.md).

### Portal limits, primary sources only (captured 2026-09-12)

Method: each portal's own page or own guide PDF, fetched and read. Blogs and press quoting a number
were used only to know where to look; none of their figures are cited. The SSCASN FAQ table below was
re-read by hand in a browser the same day, on top of the research pass.

**SSCASN / BKN (CPNS, PPPK, Sekolah Kedinasan), the anchor.** Two independent portal-owned sources.

- FAQ, `https://sscasn.bkn.go.id/faq/`, category "Unggah Dokumen", question "Berapa ukuran dan tipe
  file yang diupload?". Verbatim: "Ketentuan ukuran dan tipe file: 1. Pas Foto maksimal 200 KB (JPG)
  2. KTP maksimal 200 KB (JPG) 3. Ijazah maksimal 700 KB (PDF) 4. Transkrip maksimal 400 KB (PDF)
  5. Rapor maksimal 500 KB (PDF) 6. Dokumen Lainnya maksimal 1 MB (PDF) 7. Bukti Bayar maksimal 200
  KB (JPG) 8. Surat Lamaran maksimal 400 KB (PDF) 9. Surat Keterangan maksimal 500 KB (PDF)". The
  answer is not tied to a cycle; the site's live cycles at capture were Seleksi Sekolah Kedinasan
  2026 and Seleksi CASN Sekolah Rakyat 2026.
- Buku Panduan Pendaftaran SSCASN v1.1 (38 pages), linked from `https://sscasn.bkn.go.id/buku-petunjuk/`,
  file at `https://loker.bkn.go.id/index.php/s/yrMqSmfFjM7TyRN`. Account creation, p.7: "Unggah
  dokumen Scan KTP (format JPG/JPEG, maksimal 200 KB);". Document tab, p.25-26: the per-document caps
  are "sesuai dengan ketentuan yang diinput oleh Admin Instansi", so they vary by agency and
  formation; the guide's own live example (Gambar 4.10, Kementerian Dalam Negeri, S-1 Ilmu
  Pemerintahan, Sekolah Kedinasan 2026) shows surat lamaran 1000 KB PDF, ijazah asli 1000 KB PDF,
  transkrip 1000 KB PDF, pas foto 4x6 500 KB JPG. Same page: "ukuran minimal setiap berkas adalah 80
  KB dengan ukuran maksimal tergantung jenis berkas" (the screenshot inside the guide says 100 KB;
  two elements of the same guide disagree on the floor, flag it, do not resolve it).

Reading for the page: the photo caps (pas foto, KTP, bukti bayar) are a firm 200 KB JPG in both
sources. The PDF caps are per instansi: the FAQ's reference table says 400 to 700 KB for the main
documents and 1 MB only for "Dokumen Lainnya", while a live 2026 formation shows 1000 KB across the
board. The page says "under 1 MB is the ceiling you will meet on SSCASN, and many formations ask for
less, check your own formation's tab", never one universal number. The minimum-size rule (80 or 100
KB) is the second awkward fact: a file can be rejected for being too small.

**SNPMB (SNBP, UTBK-SNBT 2026).** Two official guide PDFs, both fetched and text-extracted.

- Panduan Pendaftaran UTBK-SNBT 2026, `https://files.snpmb.id/web2026/Panduan%20Pendaftaran%20UTBK%20SNBT%202026.pdf`,
  p.6, Bukti Tunanetra form: "simpan berkas dengan format PDF dengan ukuran tidak lebih dari 300 KB".
  p.23, portfolio (Olahraga): video mp4 and pptx up to 50 MB.
- Panduan Pendaftaran SNBP 2026, `https://files.snpmb.id/web2026/Panduan%20Pendaftaran%20SNBP%202026.pdf`,
  p.10, Bukti Prestasi: "ukuran maksimal 2MB yang berformat pdf/png/jpg".
- The account pas foto cap the press quotes (40 to 100 KB) sits behind login and is in neither guide:
  not verifiable, not cited.

**e-Meterai (DJP / Peruri), found via the SSCASN trail.** `https://e-meterai.co.id/faqs`, "Mengapa
proses upload dokumen saya selalu gagal?": "format (.pdf) dengan ukuran maksimal 4 MB". SSCASN's surat
lamaran needs the stamp and then has to fit SSCASN's own cap, so the 4 MB is never the binding one;
worth one sentence because the stamped PDF is what gets uploaded.

**Not verifiable from a public page (stated as such on the page, or left off it):**

- SKCK, `skck.polri.go.id`: requirements page has no size limit; the upload flow is behind login.
- Kartu Prakerja, `prakerja.go.id`: whole domain 404 on 2026-09-12; programme paused.
- KIP Kuliah, `kip-kuliah.kemdiktisaintek.go.id`: the 2026 and 2024 Pedoman Pendaftaran PDFs were
  fetched and searched; neither contains a KB or MB figure. The upload step is inside SIM KIP Kuliah.
- LPDP (`lpdp.kemenkeu.go.id`) and DJP (`ereg.pajak.go.id`, Coretax): unreachable from outside
  Indonesia on the day; a reviewer inside Indonesia can retry both and add what the portal says.
- M-Paspor, `imigrasi.go.id`: both live FAQ categories checked, no size limit; the upload UI is in
  the app.
- Kemnaker Siapkerja: bot-check wall. BPJS: not checked in depth. PPDB: per-province portals, no
  national number to cite.

So: verified photo caps at 200 KB, verified PDF caps at 300 KB to 2 MB, **no verified PDF cap at 200
KB anywhere**. The "PDF at 200 KB" section stays, as a "stricter than any portal we could verify"
section, not as a portal claim.

### Measured runs through the shipped tool (2026-09-12, Chromium, `dist/` from `3cdb1f5`)

Corpus generated in a scratchpad, not committed, same method as SEO-17: synthetic phone-scan pages
(rendered typed document, warm background, vignette, 1 to 2 degrees of skew, per-pixel noise) at
2000x2800 px, JPEG q85, 511 to 591 KB per page, assembled with `@cantoo/pdf-lib`; a 3-page typed PDF
(2,809 B); the CC0 Estany Llat Pixel 8a photo from SEO-31 (2,152,277 B, 4032x2268); a synthetic 3x4
pas foto (211,365 B, 1200x1600). Every run is the real island on `/compress/`, Target Size mode,
bytes read from the downloaded file, pages re-rendered at 150 DPI and graded by eye.

| Run | Input | Target | Output | Raster | Time | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| 2-page scan | 1,071,796 B | 1000 KB | 238,280 B | 892x1262 | 0.30 s | crisp |
| 5-page scan | 2,817,495 B | 1000 KB | 632,412 B | 892x1262 | 0.81 s | crisp |
| 10-page scan | 5,586,408 B | 1000 KB | 959,113 B | 892x1262 | 0.83 s | crisp |
| 20-page scan | 11,183,228 B | 1000 KB | 1,008,811 B | 892x1262 | 1.33 s | crisp |
| 40-page scan | 22,336,038 B | 1000 KB | 1,033,034 B, "closest achievable" | 892x1262 | 2.83 s | readable, mild blocking |
| 2-page scan | 1,071,796 B | 300 KB | 238,280 B | 892x1262 | 0.31 s | crisp |
| 2-page scan | 1,071,796 B | 200 KB | 203,265 B | 892x1262 | 0.30 s | crisp |
| 5-page scan | 2,817,495 B | 200 KB | 206,027 B, "closest achievable" | 892x1262 | 0.81 s | crisp |
| 3-page typed PDF | 2,809 B | 1000 KB | 2,809 B, byte-identical passthrough | vector | 0.03 s | crisp |
| Pixel 8a photo | 2,152,277 B | 200 KB | 183,357 B | 4032x2268 | 0.82 s | recognisable, colour banding and a magenta cast in sky and slopes |
| Synthetic pas foto | 211,365 B | 200 KB | 203,242 B | 1200x1600 | 0.20 s | crisp |
| Synthetic pas foto | 211,365 B | 100 KB | 83,286 B | 1200x1600 | 0.20 s | crisp |

What the numbers say, and their limits:

- Under 1 MB is an easy target for a scan of up to ten pages: the DPI ladder never stepped down in any
  run, quality alone got there, and every run finished under three seconds including the 22 MB file.
- **Caveat on the 20 and 40-page rows:** the synthetic pages carry text on the top 40% only, lighter
  than a real ijazah or transkrip scan. SEO-17's denser corpus is the harder bound (one page at 100
  KB crisp, ten pages at 100 KB total blurred). The page claims ten pages under 1 MB with confidence,
  and says twenty or more "usually, depending on how dense the scan is".
- The two "closest achievable" misses were 0.6% and 0.9% over target with a crisp page:
  `compressPdfToTarget` budgets 300 bytes per page of container overhead and this corpus ran about
  230 to 245 bytes over that per page. Tool follow-up, not this ticket: the miss notice says the
  document would become unreadable, which is not what happened; distinguish a near-miss from a
  quality floor.
- 200 KB spread over five scanned pages was still crisp here, which is more than the page needs to
  promise; the page says two to three scanned pages, since the FAQ-table documents (surat lamaran,
  transkrip) are that length.
- The photo is where compression shows: a detailed 2 MB photo at 200 KB kept full resolution and
  paid in colour (same shape as SEO-31's 20 KB finding, milder). A plain pas foto barely needed
  compressing. The page says: a pas foto under 200 KB is routine; a busy photo pushed hard picks up
  colour noise before it loses detail.
- Units: portals do not say whether "200 KB" means 200,000 or 204,800 bytes; two outputs here (203,242
  and 203,265 B) sit between the two. The page tells people to aim ten percent under the cap.

Reproduction: `scratchpad/loc15/{gen-pages,assemble-pdfs,gen-pasfoto,run-measurements,render-legibility,extract-image-dims}.mjs`
against `python3 -m http.server 4331 --directory dist`; `results.json`, `legibility/*.png` and
`outputs/*` alongside. Scratchpad only; regenerate from the scripts if needed again.

### What building needs (not started, pending approval)

- The standalone `localizedPages` variant LOC-13 designed does not exist yet: the schema still
  requires `pageId` and `sourceHash`, and `getDocumentationVariants` throws on a `pageId` with no
  English twin. Needed: a standalone shape (own slug, no hash, same review gate, self-canonical, no
  hreflang), taught to `src/i18n/documentation.ts`, `src/pages/sitemap.xml.js` and
  `src/pages/[locale]/[contentPage].astro`.
- `id` in both locale registries (the "only he and es-co" line above is stale: eleven prefixes are
  registered today, `id` is not among them), a `PILOT_COUNTRY_BY_PREFIX` row (Indonesia), the
  `vercel.json` redirect pair, and the CSS ratchet narrowed rather than bumped.
- Reviewer: Shlomi sources and pays a native Indonesian reviewer; the brief in `docs/` is what they
  get. The reviewer inside Indonesia can also retry LPDP and DJP, which were unreachable from here.

## Built, 2026-09-13

**Reviewer gate waived.** Shlomi decided on 2026-09-13 that no paid native reviewer would be sourced
and that an AI review stands in. Recorded as such rather than quietly reinterpreted: the front matter
names `reviewer: 'Claude (AI review, no native speaker)'`, `reviewNotes` says so in plain words, and
the languages page snapshot (`docs/i18n-status/data/i18n-status.json`, `id` row) carries the waiver.
What an AI review can vouch for: every number and quote matches this ticket (checked line by line,
all matched), the voice rules, FAQ-to-body consistency. What it cannot: whether the Indonesian reads
like a person wrote it. The eight-week read judges the waiver as much as the page.

**What shipped, branch `loc-15-indonesian-pilot`:**

- `src/content/localized-pages/id/kompres-pdf-di-bawah-1-mb.yaml`, published. H1 "Kompres PDF di
  Bawah 1 MB dan Foto di Bawah 200 KB", five sections as the brief, eight FAQ entries, no images.
  Written by a Sonnet agent from the brief; a second Sonnet agent with fresh context reviewed it
  (three must-fix items: a meta-language heading, two FAQ claims not in the body; eight wording
  items), all applied, plus my own pass (the synthetic scans and pas foto are labelled as such on the
  page, "unggah" replaced by "pilih" for choosing a file, the per-instansi 1000 KB example sourced).
- The standalone `localizedPages` variant (`standalone: true`, no `pageId`/`sourceHash`, same review
  gate, routed by file name, no hreflang, self canonical, in the sitemap): `src/content.config.ts`,
  `src/i18n/documentation.ts` (`localizedPageId`, context lookup without an English twin),
  `src/pages/sitemap.xml.js`, three unit tests.
- `id` in `documentationLocales.ts` and `localePrefixes.js`, `PILOT_COUNTRY_BY_PREFIX.id = 'Indonesia'`,
  the Indonesian shell-message catalogue in `documentationMessages.ts`, the redirect pair.
- CSS ratchet **lowered** 9.97x to 9.92x while adding a page: `CompareFigure.astro`'s CSS is now a raw
  string emitted as `<style is:inline>` with its CSP hash registered per page
  (`src/lib/cspHash.js`), so the twelve content pages that never render the figure stopped carrying
  it (9.94x to 9.76x at 40 pages; 9.92x at 41). A conditional import alone changed nothing, Astro
  follows dynamic imports for CSS. `CompareTable.astro` has the same leak; next narrowing.
- Full `ci.yml` chain run locally in the worktree: backlog, guidance, 2,523 unit tests, `astro check`
  0 errors, the six guard scripts, build, `test:csp` (42 files), `test:seo` (42 pages),
  `test:redirects` (39 routes), `test:css`, `test:weight`, Playwright `e2e/content`, `e2e/localized`,
  `csp-smoke`: all green. The page and the figure page checked in a browser on the preview build.

**Open after this lands:**

- Push, then Shlomi requests indexing in Search Console and the date goes here and in
  `docs/seo-last-crawled.json` under `indexingRequested`. Eight-week read counts from that date.
- The page is reachable from the sitemap only; no English page links to it. Worth one link from
  `/pdf-wont-compress-to-100kb/` or `/compress/` ("Bahasa Indonesia" in the related block) so it is
  not an orphan for the crawler. Not done here: it touches an English page's copy.
- The languages page artifact itself (the self-editing one) still says "source a paid native
  reviewer"; the repo snapshot is updated, the artifact needs the same edit.
- Tool follow-ups surfaced by the measured runs (not this ticket): the "closest achievable" notice
  claims unreadability on a sub-1% overshoot; the target search prefers full resolution at floor
  quality on photos (SEO-31's finding again, milder at 200 KB).
