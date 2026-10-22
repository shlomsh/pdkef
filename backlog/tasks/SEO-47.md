---
id: "SEO-47"
title: "Fix a blurry PDF: size the demand, then one guide that explains the real causes plus an on-device cleanup for faded scans"
status: "open"
priority: "P3"
epic: "search-and-languages"
horizon: "next"
needs: "Keyword Planner volumes for the blurry cluster, and a GSC check for blurry queries already landing on us"
---

# SEO-47 · "Fix blurry PDF": an honest page for a real query

Filed 2026-10-22 from Shlomi's look at PDFSimpli's `/tools/fix-blurry-pdf-online-free/`.

## What the competitor page is

- A keyword landing page over their generic upload-and-repair flow. Its own headings read "Upload Your Damaged
  File" and "How to repair PDF files online"; the blur page is a skin on PDF repair.
- It promises to sharpen text, enhance clarity and fix low-resolution scans, and never names a method (no
  upscaling, OCR or sharpening step is described). Files go to their server; 20MB and 5-file limits.
- This is the doorway pattern we don't build: one tool, many keyword wrappers, claims nobody can check.

## Why the query is still worth a page

- The intent is real: `fix blurry pdf`, `make pdf clearer`, `enhance scanned pdf`, `blurry pdf text`. The
  standard SERP (2026-10-22) is vendor guides: SwifDoo, the Smallpdf blog, UPDF, Tungsten. No volumes yet.
- "Blurry" is the opposite intent from our blur franchise (SEO-04, `/blur-vs-blackout-vs-delete-pdf/`). It is a
  separate cluster and must not touch the blur pages' titles, copy or internal links in a way that dilutes them.
- We have something true to teach. A PDF looks blurry for one of three reasons, and each has a different fix:
  1. **The scan was low resolution.** Detail that was never captured cannot be restored; rescanning at 300 DPI is
     the fix. Say so plainly.
  2. **It was compressed hard.** Our own Compress rasterizes, and SEO-17 measured ten pages at 100KB coming out
     with blurry body text. The fix is a gentler target from the original file.
  3. **The viewer is smoothing it.** The file is fine; the display setting or an old reader is not.

## Step 1: size it (before any build)

- Keyword Planner volumes for the cluster above (Shlomi).
- GSC: do any `blurry` / `unblur` / `clear` queries already land on our blur pages? If they do, those are
  mismatched visits and this page is also a fix for them.
- Decide build or retire from the numbers. Record the read in `docs/seo-competitive-findings.md`.

## Step 2: if it earns a build

- **One guide page** in the content collection, hub `compress`, teaching the three causes with a way to tell
  which one you have (can you select the text? does it zoom sharp at 400%? was it compressed?). Every claim is
  checked against the code or a real file run, like SEO-17's measured table.
- **An on-device cleanup only if it helps a real case.** Faded gray scans get genuinely more readable from a
  contrast or threshold pass, rendered and re-embedded locally. Measure it on real faded scans before writing a
  word of copy, and never claim it adds resolution. If the measurement says it doesn't help, the guide ships
  without a tool and points to rescanning and Compress's gentler settings.
- The SEO shell stays static HTML; the new route gets its `vercel.json` redirect pair; voice per
  `content-and-copy`.

## Done when

- Step 1's read is recorded and the build-or-retire call is made.
- If built: the page is live, indexed, `test:seo` / `test:csp` / `test:redirects` green, and an eight-week GSC
  read is scheduled.
