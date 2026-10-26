---
id: "SCAN-01"
title: "Scan to PDF: its own tool at /scan-to-pdf/, sharing Image to PDF's engine, plus a how-to-scan-to-PDF guide"
status: "in_progress"
priority: "P3"
epic: "search-and-languages"
horizon: "next"
---

# SCAN-01 · Scan to PDF as its own tool, and a guide that answers "how to scan to PDF"

*Filed 2026-10-26* from a look at https://www.ilovepdf.com/scan-pdf, Shlomi's Google Trends screenshots and US
Google results read in the built-in browser the same day.

## Why

- **Demand is modest and climbing.** Worldwide over five years, "scan to pdf" runs at roughly a tenth of "image to
  pdf" and a fiftieth of "jpg to pdf" (Trends, relative). "scan pdf" and "scan to pdf" rose sharply from mid-2025.
  Third-party US estimates (seodata.dev, July/August 2026, not measured by us): pdf scanner 6.6K, pdf scan 6.6K, scan
  a pdf 4.4K, scan to pdf 2.9K, pdf scanner app 2.9K, scan document to pdf 1.6K a month.
- **Much of it is a question.** The top Trends related queries for "scan to pdf" are "how to scan to pdf" (100) and
  "how to scan pdf" (96). Those results are Reddit, YouTube and university help pages pointing at the phone's own
  scanner (iPhone Notes and Files, Google Drive).
- **Small web tools rank.** Page one for "scan to pdf", "scan pdf" and "online document scanner" mixes app-store
  listings with browser tools (lensup.ai, toscanned.com, aicarousels.com, avepdf.com). Google's AI overview for
  "online document scanner" describes the flow as upload or capture, crop and straighten, filter, export, and notes
  that most browser scanners work locally. So on-device processing alone is not our difference; the next step is.
  Scan, then sign, merge or compress the same file in one place.
- **The size problem is the real pain.** Apple Community threads report Notes scans of 30 to 60 MB, and upload
  portals (job boards, immigration, schools) cap at about 1 MB.
- **What iLovePDF does:** a QR hand-off to its mobile app. PDF24 uses the browser camera but processes on its
  servers.

## Scope

### 1. Scan to PDF tool (`src/tools/scan/`, route `/scan-to-pdf/`)

**Decided 2026-10-26: its own tool, because the search case holds.** A mode inside Image to PDF cannot carry "scan to
PDF" in its title, H1 and description, and the term has its own demand and its own page-one results. So: a new route
with its static SEO shell (title, H1, description, how-it-works, FAQ and JSON-LD on "scan to PDF"), a registry entry
in `src/data/tools.js`, the non-slash redirect pair in `vercel.json`, and the tool count updated wherever it is stated
(CLAUDE.md "ten tools", README, site copy). Image to PDF keeps its page and stays as it is apart from what moves.

**Shared engine, not a copy.** What both tools use (image to PDF page building, `pageOrder.js`) moves from
`src/tools/image-to-pdf/` to `src/lib/` under the rules in `docs/module-boundaries.md`; scan-only code (corners,
warp, filters) stays in `src/tools/scan/`. Image to PDF's done state offers "Clean it up as a scan" for a photo of a
page, and Scan's done state hands off to Sign, Merge and Compress.

Today Image to PDF takes JPEG/PNG and sizes each page to its image. The Scan tool adds:

- **Camera.** On a phone, a "Take a photo" entry (file input with `capture`, so no camera permission prompt and no
  `getUserMedia` in v1), one page per shot, add more pages, reorder with the existing `pageOrder.js`.
- **Corner crop and perspective fix.** Four draggable corners per page, prefilled by an edge guess when one is
  found and the full image when not. Warp to a flat rectangle. The guess is a pure function behind one contract, so a
  better detector can replace it later; the person's corners always win.
- **Document filter.** Original, grayscale, and a clean black-and-white "document" look (even out lighting, raise
  contrast). Pure image functions, unit-tested on fixtures.
- **Page size.** Fit to image (today's behaviour), A4 or Letter, the same for every page.
- **Size target.** Optional "under N KB/MB" that steps JPEG quality and resolution down and shows the final size,
  reusing what Compress already measures rather than a second implementation.
- **Done state** hands off to Sign, Merge and Compress in the Merge-row pattern (`docs/ux-design-guidelines.md`).
- Gesture rule applies to the corner drags: DOM during the drag, one commit on release through
  `src/lib/gestures/controller.ts`.

The page carries its own weight budget; the warp and filter code loads only once a photo is in.

### 2. Guide page (`src/content/content-pages/how-to-scan-a-document-to-pdf.yaml`)

"How to scan a document to PDF": the built-in routes on iPhone (Notes, Files), Android (Google Drive, Files) and a
desktop scanner, verified step by step on current OS versions, then when PDkef helps (a photo you already took, a
file too big for a portal, a scan to sign next). Link from `remove-camscanner-watermark-from-pdf` and
`photo-and-signature-size-for-forms`. Voice per the content rule, no competitor names.

### Out

- "Make a PDF look scanned" (fake tilt, noise and grain). A separate search cluster, and we don't fake scans.
- OCR and searchable text.
- A desktop-to-phone QR hand-off.

## Acceptance

- [ ] On an iPhone and an Android phone: take three photos of a page at an angle, fix the corners, choose the
      document filter and A4, set "under 1 MB", download a three-page PDF under 1 MB that reads cleanly.
- [ ] The same from photos already on the device.
- [ ] Edge guess, warp, filters and size-target stepping are pure functions with unit tests; one e2e covers the
      corner drag on a rendered page.
- [ ] `/scan-to-pdf/` is live with its static SEO shell, registry entry and redirect pair; `test:seo`,
      `test:redirects` and `test:module-boundaries` pass, and Image to PDF behaves as before.
- [ ] Nothing new leaves the device; `test:csp`, `test:weight` and `test:lazy-modules` pass.
- [ ] The guide page is live, linked from the two pages above, its FAQ JSON-LD matches the page.
- [ ] After four weeks, Search Console impressions and clicks for queries containing "scan" are recorded here.

## Open questions

- Does iOS Safari hand over HEIC from the photo library? `accept` today is `image/jpeg,image/png`.
  **Answered 2026-10-26 (documented mechanism, phone check pending):** with an `accept` list that leaves
  HEIC out, Safari converts a photo of any other type to the first listed type, so a library pick arrives
  as JPEG (WebKit bug 303803, which documents the conversion; https://bugs.webkit.org/show_bug.cgi?id=303803).
  Listing `image/heic` is what makes Safari hand HEIC over, and Safari 17+ then even converted JPEGs to
  HEIC (Apple developer forums thread 743049), so Scan keeps `image/jpeg,image/png` on both the picker and
  the camera input. Chrome on iOS is WebKit and behaves the same (inferred). A `.heic` file on a desktop
  or an Android HEIF photo is not offered by the picker and, dropped, is skipped with a message; Chrome and
  Firefox cannot decode HEIC anyway. To confirm on Shlomi's iPhone: a library pick of a HEIC photo
  arrives and scans.
- Does Hebrew get a `/he/` Scan page at launch? Follow the languages page, not this ticket.

## Progress 2026-10-26 (branch `claude/scan-to-pdf-cdd83e`, not yet on main)

Built as designed in `docs/scan-to-pdf.md`. Checked on a production build: three 12 MP photos of a page
at an angle, Document, A4, 1 MB gave a three-page A4 PDF of 1,045,882 bytes that reads cleanly, ready
about 3 s after the pick on a laptop; no sideways scroll at 375, 768, 1280 and 1440. `check:push` green;
the diff's Playwright projects green (one Merge phone spec flaked once, then passed 3 of 3 alone).

Still open: the two phone acceptance items (Shlomi's iPhone and an Android phone, including the HEIC
library pick), landing on main, and whether Scan joins the home dock (`homeDock: false` for now, see the
design record). The four-week Search Console read follows the launch.

Landed on main 2026-10-26, after Shlomi's iPhone rounds the same day (review each photo first, a look
per page, the flatten animation, the corner loupe, small previews for iPhone memory, Scan on the home
dock). Still open: an Android phone pass, and the four-week Search Console read. A page with a dark
band along one edge still defeats the edge guess; an edge-line detector is in its own session.

