---
id: "SEO-31"
title: "Read 2026-11-07 · One content page on photo and signature size limits, as inbound content for /compress-image/"
status: "blocked"
priority: "P1"
epic: "seo-awaiting-read"
phase: "near-term"
depends_on: ["SEO-19"]
legacy_state: "Open"
---

# SEO-31 · Read 2026-11-07 · One content page on photo and signature size limits, as inbound content for /compress-image/

*Re-filed 2026-09-12* from `search-acquisition` into `seo-awaiting-read`, status `in_progress` to `blocked`, read date 2026-11-07: live; eight-week read.

## Why

Shlomi's model for these pages (the same one behind `/pdf-wont-compress-to-100kb/`, SEO-17): they are
the site's blog posts. Each starts from a problem a person actually has and asks Google about, answers
it for real, and sends the reader to the tool that solves it. `/compress-image/` shipped this week
(SEO-19) and has no indexed history yet; this page is its inbound content, the same relationship
`/pdf-wont-compress-to-100kb/` has to `/compress/`.

LOC-11's 2026-09-12 autocomplete sweep (section "The unknown unknowns") already flagged the gap this
page closes: *"The adjacent demand is images, not PDFs. Every locale's task seeds complete to photos
before PDFs... An image-to-target-KB tool is a product gap, not a localization question, noted for the
SEO epic, not acted on here."* SEO-19 built the tool; this ticket is the "acted on here."

SEO-17 itself already grew a small photo/signature section on 2026-09-12 (IBPS row, one FAQ, a link to
`/compress-image/`) because the same visitor fighting a 100KB document cap is usually also fighting a
separate, smaller photo and signature cap on the same form. That addition was a patch on the document
page, not a real answer to the photo question, which is why this ticket exists as its own page rather
than growing SEO-17 further.

## Step 1: autocomplete evidence and the slug decision

Ran `node scripts/seo-autocomplete.mjs en <IN|US|PH> <seeds...> --letters` with seeds `photo size`,
`reduce photo size to`, `compress photo to`, `photo under`, `jpg to`, `image size reduce to`,
`passport photo size`, `signature size`, `photo won't`, `photo too big for`, `resize photo to`,
`photo 50kb`, `photo 20kb`, plus a second pass with `photo and signature size`, `photo signature size`,
`photo size for application form`, `photo size for exam`, `how to reduce photo size for`,
`why won't my photo`, `photo dimensions and size for` (all `hl=en gl=IN`, near-identical results for
`gl=US` and `gl=PH` on the first seed set - this is not a locale-varying query family the way LOC-11's
target-size PDF phrasings were).

**What converged, all three locales:**

- `resize photo to 50kb` / `20kb` / `100kb` / `15kb` / `200kb` / `1mb` - a direct, size-first phrasing.
- `signature size for ssc`, `signature size for pan card`, `signature size should be between 10 kb and
  20 kb`, `signature size in kb`, `signature size reducer` - signature is searched as its own object,
  not folded into "photo."
- `photo won't upload` - present in all three, but its completions are dominated by unrelated device
  problems (iPhone, Instagram, Messages), not portal caps. Not used as evidence for this page.
- `photo too big for` - completions are almost entirely social apps (Instagram, WhatsApp, LinkedIn,
  wallpaper), not application forms. Not used.

**The strongest single signal, from the second pass (`en IN`):** seeding `photo and signature size`
directly returns real completions naming actual portals and exams as a unit: `photo and signature size
for ibps clerk`, `photo and signature size for government exam`, `photo and signature size for pan
card`, `photo and signature size for ctet`, `photo and signature size for gds`, `photo and signature
size in kb`, `photo and signature size combined in jpg format`, `photo and signature size reducer`.
Also converging: `photo size for application form`, `photo size for exam form`, `standard photo size
for application form`, `photo size for bank exam`, `photo size for government exam`, and a long tail of
named exams (CTET, GATE, NEET, JEE, RRB NTPC, CGL). This is the exact shape of the problem Shlomi
described: one form, two separately-capped uploads, searched as a pair, generalizing across specific
exam names rather than tied to one.

**Slug and H1 decision:** `/photo-and-signature-size-for-forms/`, H1 "Photo and Signature Size for
Application Forms." Picked over a `photo-wont-fit` framing because the evidence for "won't" / "too big
for" pointed at device problems, not portals, while "photo and signature size [for X]" is a real,
repeatedly-converging phrase people generalize across many named forms - which is exactly why one page
for the concept beats one page per exam name (the doorway pattern CLAUDE.md and SEO-17 both rule out).
Deliberately does not use "compress image to 100kb" or "reduce photo size" as the anchor phrase - that
family belongs to `/compress-image/`'s own H1 ("Compress Image to 100KB Free: Reduce Photo Size"); this
page owns the "what actually determines this, and what this tool won't do for you" question instead,
the same division SEO-17 has from `/compress/`.

## Step 2: portal sources

**Reused from SEO-17 (both fetched 2026-09-12 from `ibpsreg.ibps.in`, see that ticket's log for the
per-cycle PDF URLs, which rotate and are why the page cites the portal root instead):**

- IBPS "Guidelines for scanning and Upload of Documents": photograph 200x230 px, 20KB-50KB, JPEG;
  signature 140x60 px, 10KB-20KB, JPEG.
- NTA UGC-NET information bulletin
  (`https://ugcnet.nta.ac.in/images/information-bulletin-for-ugc-net-june-2025-16042025.pdf`):
  photograph 10KB-200KB, signature 4KB-30KB, JPEG.

**New for this ticket, fetched and verified 2026-09-12:**

- UPSC CAPF(ACs) Exam 2026 notice, `https://www.upsc.gov.in/sites/default/files/ExamNotifi_CAPF_AC_Exam_2026_Eng_20022026.pdf`
  (`upsc.gov.in` itself, not `upsconline.nic.in`; downloaded and read directly, not via a search
  snippet). Verbatim: *"photograph file should not exceed 200 KB and must not be less than 20 KB in
  size and signature file should not exceed 100 KB and must not be less than 20 KB in size."* No pixel
  dimensions stated in this document.

**Attempted and dropped, primary-source-only rule:** `upsconline.nic.in`'s own instruction PDFs
(`instruction-photo-signature-upload-upsc.pdf`, `Instructions for uploading documents-new-2.pdf`, both
found via search) both 404 on the live site (verified with `curl -I`, not just WebFetch, to rule out a
rendering problem on our end). `passportindia.gov.in` and `upsconline.nic.in`'s own pages are JS-shell
SPAs that WebFetch/curl retrieve empty - the same failure mode SEO-17 already logged for `ssc.gov.in`.
Coaching and resizer-tool sites (vajiramandravi, testbook, padhai.ai, and others) carry photo/signature
numbers for UPSC, Passport Seva, SSC and CTET confidently and consistently with each other, but none of
them is the primary source, so per the ticket's own rule none of those numbers are on the page. If a
future ticket finds a working primary URL for Passport Seva or SSC, add it there rather than reopening
this one.

## Step 3: the measurement plan (run 2026-09-12)

The page shipped with a `table` block whose caption and every number/readability cell was the literal
placeholder `TBD` - see the acceptance note in `docs/seo-competitive-findings.md`'s referenced
discipline (SEO-17's own model) for why this was deliberate rather than an oversight: the lead would not
commit the page until every `TBD` was replaced with a number from a real run. That run happened
2026-09-12, below.

## Measurements (2026-09-12)

**Method.** Production build (`npm run build`) served locally by `astro preview`. Each file driven
through the shipped `/compress-image/` island in a real Chromium browser via Playwright, one file per
run, using the island's own typed KB target (not a preset). The download triggered by the island was
saved to disk and read back for its real byte count; output pixel dimensions were read from the
island's own rendered result text, not measured independently. Every run hit its target on the first
try (the tool never fell back to reporting a miss) and completed in under 0.4 seconds.

**Inputs, described by kind, size and dimensions only:**

1. Portrait photo (phone selfie, JPEG, 866,956 bytes, 1450x2576).
2. Signature on white paper, photographed uncropped with the phone (JPEG, 588,539 bytes, 1450x2576;
   the signature occupies a small part of the frame).
3. One-page printed letter, photographed with the phone (JPEG, 1,145,617 bytes, 1450x2576).
4. Phone-size screenshot of a text web page (PNG, 636,473 bytes, 1290x2796), fed through the tool,
   which always re-encodes its output to JPEG.

**Caveat carried onto the page:** all three photos are as-uploaded phone photos at 1450x2576, not raw
camera files - they had already been downscaled once (from a raw phone capture, typically 3000x4000 or
larger) before they reached this measurement. The page states this explicitly so the numbers aren't
read as the largest file a reader might start from.

**Results:**

| Input | Target | Output bytes | Output dimensions | Judgement |
| --- | --- | --- | --- | --- |
| Portrait photo | 50 KB | 50,053 | 1450x2576 (full size, quality only) | Crisp; indistinguishable from the original at phone size |
| Portrait photo | 20 KB | 19,538 | 1088x1932 | Fine; slight softening you only notice zoomed in |
| Portrait photo | 10 KB | 9,771 | 725x1288 | Face clearly recognisable, but visibly soft and blocky in hair and skin. Usable as an ID photo only because it is still far larger than the 200x230 px a portal asks for; cropping to that size first would spend the same 10 KB on a tenth of the pixels and look sharp |
| Signature photo | 20 KB | 20,432 | 1088x1932 | Signature legible, strokes soft |
| Signature photo | 10 KB | 10,101 | 725x1288 | Legible but soft with a faint halo around the strokes; nearly all the budget went on blank paper. This is the row that shows why cropping to the signature (140x60 px at IBPS) comes before compressing |
| Letter photo | 200 KB | 202,936 | 1450x2576 | Crisp |
| Letter photo | 100 KB | 90,244 | 1450x2576 | Crisp; body text fully sharp |
| Letter photo | 50 KB | 48,852 | 1088x1932 | Fully readable with mild softening |
| Text screenshot | 50 KB | 48,969 | 968x2097 | Headings sharp; body text readable but visibly softened with faint ringing at the letter edges; small grey text borderline. Screenshots and scans of text are where JPEG shows its limits at a small target |

**What this changed in the copy.** The `table` block's caption and rows in
`src/content/content-pages/photo-and-signature-size-for-forms.yaml` were rebuilt from the six planned
rows into the eight shown on the page (nine were run; the results table above is the full record, see
"Schema fit" below for why one row stayed off the page). The section header and kicker no longer say
"numbers pending"; the caption now states the method, matching how `pdf-wont-compress-to-100kb.yaml`'s
own measured table is worded. The body prose in the first ("Pixel dimensions first, JPEG quality second") and second
("What this tool does not do") sections was tied to the measured rows rather than left as an unverified
general claim, and two new prose blocks were added directly under the table: one carrying the
as-uploaded-1450x2576 caveat, stating that a photo reaches even 10 to 20KB because it is one image, not
a page count, and explaining why the 100KB letter row keeps full dimensions while the 50KB row and the
signature/portrait rows do not (the scale ladder, not cropping); the other pointing at the signature
row and the 10KB portrait row as the concrete proof that compressing without cropping first spends the
budget on pixels that do not matter. No number in the plan changed; only the prose around the numbers
did, and only where it needed to reference what the rows actually showed.

**Schema fit, 2026-09-12.** `astro check` caught that the table block's schema
(`src/content.config.ts` lines 100-101) caps a table at 4 columns, 8 rows, 220-character cells and a
200-character caption; the first pass shipped 5 columns, 9 rows and an over-length caption. The page
was reworked to fit without touching the schema: the Target column folded into the first column ("Same
portrait, at 20 KB" and so on), the caption shortened to the method and date only (the as-uploaded
caveat moved into the prose block right under the table, see above), and the two 10KB judgement cells
tightened without changing the judgement itself. The least informative row, the 200KB letter result
(crisp, full size, no surprise), was dropped to bring the row count to 8; the results table above keeps
all nine measurements as the record, but **the live page shows eight rows, not nine** - the 200KB
letter measurement stayed in this ticket and out of the page.

## The awkward fact (already in the page body, not only the FAQ)

Read `src/lib/compressImage.js`: `compressImageToTarget` walks a scale ladder (`[1, 0.75, 0.5, 0.3,
0.15]`) crossed with a JPEG quality search until it clears the KB budget, or returns the smallest result
it found. It does **not** crop or resize to a specific width and height - it has no concept of a target
pixel size at all, only a target byte size. Several of the cited portals check an exact pixel size
alongside the KB range (IBPS: 200x230 for the photo, 140x60 for the signature). The page states plainly
that a visitor with a pixel-dimension requirement has to crop first, with their phone's own crop tool or
any editor, and only then bring the cropped file under the KB cap with this tool - compressing before
cropping can push an already-tight result back over the limit. This is stated in the second section's
body prose, not buried in an FAQ answer.

## Acceptance (SEO-17's form)

- Page exists as one YAML entry (`src/content/content-pages/photo-and-signature-size-for-forms.yaml`)
  with a registry entry (`src/data/contentPages.js`, `hub: 'compress-image'`, `alsoHub: ['compress']`)
  and a redirect pair in `vercel.json`; the build's two-registry cross-check passes.
- The measured table's rows carry real numbers from real files run through the shipped tool in a
  real browser, replacing every `TBD`, before this ticket is closed. **Done 2026-09-12** - see
  "Measurements (2026-09-12)" above for method and results.
- Every portal limit cited to a primary source (IBPS, NTA UGC-NET, UPSC), each with a URL and a capture
  date in this ticket. No coaching-site or resizer-tool number on the page.
- The "this tool does not crop to pixel dimensions" caveat is stated in the body, not only in the FAQ.
- `npm run test:seo` passes; FAQ mirrored into `<SeoSchema>`; single `<h1>`; trailing slashes correct.
- Indexing requested for `/photo-and-signature-size-for-forms/` by Shlomi on 2026-09-12, the same
  day he resubmitted `/compress-image/` (first requested 2026-09-11), so the two URLs run as one
  experiment against the same portal-limit intent. Eight-week read due 2026-11-07. Dates also in
  `docs/seo-last-crawled.json` under `indexingRequested`.
- **Eight weeks after indexing**, read from the shared Search Console pull: impressions on
  photo/signature-size queries, and whether `/compress-image/` picks up any of them through this page's
  inbound link (the same question SEO-19's own log asks about `/compress-image/`'s standalone URL).

## "Ships alone in its week," reconciled

The epic's sequencing rule says a new content page ships alone in its week. SEO-19 (the
`/compress-image/` tool itself, plus a `/compress-image/` registry/redirect/llms.txt change) shipped
this same week. Shlomi decided to build this page now anyway, on the reasoning that a freshly-launched,
unindexed tool page benefits more from having its inbound content ready at the same time than the
sequencing rule protects against here - there is exactly one other new URL this week
(`/photo-and-signature-size-for-forms/` itself), not the three-doorway-pages problem the rule exists to
prevent. Recorded here rather than silently violating the rule.

## Figure (2026-09-12)

The measured table above proves the numbers; it does not show a reader what a compressed photo
actually looks like. Added a before/after split figure (`src/components/CompareFigure.astro`, a new
`compareFigure` block in `src/content.config.ts`) to the "Real phone photos, run through Compress
Image" section, directly under the eight-row table: one real photo, left half original, right half the
tool's real 20KB output, static markup only (no JS, per the SEO-surface invariant) - the non-interactive
sibling of the Preact `CompareSlider` island used elsewhere on the site.

**Photo choice.** First pick was a CC0 footbridge photo from Wikimedia Commons; Shlomi rejected it as
too big to justify (4.83MB original) and asked for something in nature/mountains with a smaller
original so the "2MB phone photo" framing on this page would hold up literally. Landed on "Estany Llat
2026.jpg" by Alan Mattingly, Wikimedia Commons, CC0 1.0 Universal: a mountain lake in the Pyrenees shot
on a Google Pixel 8a, 4032x2268, 2,152,277 bytes (2.05MB), EXIF carrying GPS - close to the page's own
stated "3 to 6MB" and "1450 by 2576" phone-photo range, and small enough that a full before/after pair
of renditions stays a trivial page-weight cost.

**Measured (real Compress Image run on the original, headless Chromium, production build,
2026-09-12).** All three targets hit on the first try, roughly 0.35s each, canvas re-encode dropping
EXIF (GPS included):

| Target | Output bytes | Output dimensions |
| --- | --- | --- |
| 100 KB | 89,605 | 3024x1701 |
| 50 KB | 49,938 | 2016x1134 |
| 20 KB | 19,052 | 1210x680 |

The 20KB row is what ships: it is the same order of magnitude as this page's own photo/signature rows
(the IBPS photograph row alone spans 20-50KB) and the smallest of the three, so the before/after split
carries the least page weight for the clearest "yes, this really works at a small target" proof.

**What ships.** Two 1210x680 renditions in `public/images/photo-and-signature-size-for-forms/`:
`estany-llat-before.webp` (140,632 bytes, the original resized to the tool's output size so the split
lines up pixel for pixel) and `estany-llat-20kb.jpg` (19,052 bytes, byte for byte what Compress Image
produced). Both `loading="lazy" decoding="async"`, same-origin, so the service worker's cache-first rule
covers them after the first visit; `npm run test:weight` excludes lazy images from the eager budget by
design.

**What the right half looks like, and two wrong theories on the way there.** In the built page at 390
wide (2x and 3x, Chromium and WebKit) the right half's far ridges are blotchy and purple. The builder
read it as a browser image-decode bug triggered by two rasters painting together; I then read it as
the browsers' DCT-scaled JPEG decode collapsing 4:2:0 chroma into flat patches, and shipped a WebP
copy decoded at full resolution to route around it. The WebP blotched the same way. Rendering the file
alone at 1210, 700 and 350 css px settled it: the purple, patchy haze is in the 19 KB file itself
(chroma quantized to almost nothing where the distance has no contrast to hide it) and every viewer
shows it; at 1:1 it reads as ordinary JPEG noise, and downscaling turns the flat patches into blotches.
So the JPEG ships as is, and the page says what a reader will see: the far ridges go blotchy at 20 KB
while the lake and forest still read, and a portrait for a form has far less detail to lose. Recording
the dead ends so the next person does not repeat them.

**Follow-ups for the tool itself (not this ticket).** (1) The target search prefers the largest
dimensions that fit at any quality: this 20 KB result is 1210x680 at a quality near the floor. A
605x340 file at a moderate quality may look better at the same byte count for a hazy landscape; worth
a measured comparison in SEO-19's shape before changing the ladder order. (2) The Compress compare
panel (SEO-25) shows the output blob at display size, so on a phone a 20 KB result looks like this
figure's right half; that is honest, and nothing to fix, but the copy around the panel should not
promise more than that.

**CSS duplication ratchet.** `CompareFigure.astro`'s scoped `<style>` inlines into all twelve content
pages the same way `CompareTable.astro`'s already does (`content-and-copy.md`, "One accepted cost"), so
`scripts/check-css-duplication.js`'s `MAX_DUPLICATION_FACTOR` moved 9.78x -> 9.81x: measured 9.70x
(1,591,251 bytes shipped / 164,022 distinct) immediately before this change, 9.8011x (1,625,014 /
165,799) with it, on the same 39-page tree. See the dated comment in that file for the full numbers.

**What the right half looks like.** Softer than the left, with mild JPEG blocking in the forest and
the distant ridges when you look for it, and nothing that stops the picture being a picture. That is
the honest read of a 19KB file at 1210 by 680, and it is the point of showing it rather than only
tabulating it. Checked in the built page at 1280 and 390 wide (Chromium, 2026-09-12).
