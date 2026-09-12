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

## Step 3: the measurement plan (not yet run)

The page ships with a `table` block whose caption and every number/readability cell is the literal
placeholder `TBD` - see the acceptance note in `docs/seo-competitive-findings.md`'s referenced
discipline (SEO-17's own model) for why this is deliberate rather than an oversight: the lead will not
commit the page until every `TBD` is replaced with a number from a real run.

**Ask for Shlomi:** three kinds of real phone photos -

1. A portrait/passport-style photo (a person, plain background, phone camera).
2. A signature on plain white paper, photographed (not scanned) with a phone.
3. A full document page, photographed with a phone (for the "screenshot vs. photo" comparison row).
4. A screenshot of a page of dense text (for the same comparison, digital rather than photographed).

**Targets to run each through, using the shipped `/compress-image/` in a real browser via the local
preview** (per the worktree's "no preview server unless asked" rule, this step happens once Shlomi
runs or asks for `npm run build && npm run preview`, not automatically in this ticket):

| Row | File | Target |
| --- | --- | --- |
| 1 | Portrait photo | 50 KB |
| 2 | Same portrait photo | 20 KB |
| 3 | Signature photo | 20 KB |
| 4 | Same signature photo | 10 KB |
| 5 | Document page photo | 100 KB |
| 6 | Text screenshot | 50 KB |

For each: original size, achieved size (and whether the target was actually met, per the tool's own
`metTarget` flag in `compressImageToTarget`), and a real judgement of readability at 100% zoom - the
same discipline SEO-17 used for its PDF page rows, not an estimate.

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
- The measured table's six rows carry real numbers from real files run through the shipped tool in a
  real browser, replacing every `TBD`, before this ticket is closed. **Not done yet** - this is the one
  blocking item, tracked the same way SEO-17 tracked its own measurement pass.
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
