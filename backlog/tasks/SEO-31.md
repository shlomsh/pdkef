---
id: "SEO-31"
title: "One content page on photo and signature size limits, as inbound content for /compress-image/"
status: "in_progress"
priority: "P1"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-19"]
legacy_state: "Open"
---

# SEO-31 · One content page on photo and signature size limits, as inbound content for /compress-image/

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
- Indexing requested for `/photo-and-signature-size-for-forms/`, dated here when Shlomi makes the
  request. Per SEO-17's own note, request `/compress-image/`'s indexing the same day so the two URLs
  run as one experiment against the same portal-limit intent.
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
