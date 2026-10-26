---
id: "SCAN-01"
title: "Scan to PDF: a camera-and-clean-up mode on Image to PDF, plus a how-to-scan-to-PDF guide"
status: "open"
priority: "P3"
epic: "search-and-languages"
horizon: "next"
---

# SCAN-01 · Scan to PDF on Image to PDF, and a guide that answers "how to scan to PDF"

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

### 1. Scan mode on Image to PDF (`src/tools/image-to-pdf/`)

Today the tool takes JPEG/PNG and sizes each page to its image. Add, on the same island:

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

Decide in the build whether this is a mode inside the Image to PDF page or its own `/scan-to-pdf/` route over the
same island. A route needs its `vercel.json` redirect pair, registry entry in `src/data/tools.js` and its own static
SEO shell (title, H1 and description on "scan to PDF"); a mode keeps one page and earns the term through copy. Check
the page-weight budget either way: the warp and filter code loads only when Scan is used.

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
- [ ] Nothing new leaves the device; `test:csp`, `test:weight` and `test:lazy-modules` pass.
- [ ] The guide page is live, linked from the two pages above, its FAQ JSON-LD matches the page.
- [ ] After four weeks, Search Console impressions and clicks for queries containing "scan" are recorded here.

## Open questions

- Does iOS Safari hand over HEIC from the photo library? `accept` today is `image/jpeg,image/png`.
- Mode or route (above).
