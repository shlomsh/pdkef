---
id: "DEBT-69"
title: "Chrome and Edge 109 run every tool, so the old-browser notice starts below 109"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# DEBT-69 · Chrome and Edge 109 run every tool, so the old-browser notice starts below 109

Filed 2026-10-28 from the daily error read.

## Why

On 26 Oct one person on Chrome 109 (the last Chrome on Windows 7 and 8) could not open a PDF in Redact
("Invalid PDF structure", twice). `browserSupport.ts` kept the Chrome and Edge floor at 122 "until a
browser below them is shown to run every tool", so everyone on 109 also saw "This tool needs Chrome 122
or newer to open PDFs" above a tool that was working.

## What was measured (2026-10-28)

Chromium 109.0.5414.46 (Playwright 1.29.2), against a current Chromium 156 control, 1280x900:

- Redact opened and rendered four good PDFs on pdkef.com, on the same `pdf.BWa5501L.js` that threw on
  26 Oct. So that report was the person's file, not the browser.
- Every tool's main job, end to end, with the output reopened: Redact (one Blackout box, the saved-file
  check passed), Sign (a text box), Edit Pages (rotate), Merge (2 files to 6 pages), Split, Compress,
  PDF to Image, Compress Image, Image to PDF, Scan to PDF on pdkef.com; Protect and Unlock on a local
  build of origin/main. Sizes and page counts matched the control (Compress came out 270 KB against
  247 KB, valid). No `pageerror` on 109.
- Compress Image showed the PDF notice for a JPEG, though a photo never loads pdf.js.

Not measured: phone viewports, a drawn signature, Scan's corner drag, the other Split and PDF to
Image modes, anything below 109.

## Outcome

- [x] `MINIMUMS` has Chrome and Edge at 109; Firefox and Safari floors unchanged.
- [x] Compress passes `needsPdfjs: !isImageMode`, so a photo on an old browser shows no PDF notice and a
  PDF still does (unit tests seen red first).
