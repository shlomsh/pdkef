---
id: "SEO-38"
title: "One honest guide: remove the \"Scanned with CamScanner\" footer from a PDF"
status: "in_progress"
priority: "P2"
epic: "english-base"
phase: "near-term"
depends_on: ["RED-27"]
legacy_state: "Open"
---

# SEO-38 · One honest guide: remove the "Scanned with CamScanner" footer from a PDF

## Why

SERP capture 2026-09-28 (Shlomi's screenshot, `remove camscanner watermark`): page one is Reddit,
three YouTube videos, Quora, a broken site ("Something went wrong"), a small vercel.app hobby tool,
and three generic watermark-remover pages. The AI Overview cites LightPDF. "People also search for"
has eight variants (online, online free, in PDF, on iPhone, jpg, download). Demand is real and the
field is weak. GSC shows 0 impressions for any query containing "watermark": we have no page for it.

Redact already does the job: Delete lifts out a footer that is its own image, Whiteout clears one
that is baked into the scan. The broad "remove watermark from PDF" query is rejected: most of it is
about other people's watermarks, and a diagonal mark over text is not something Whiteout can honestly
remove.

Decided 2026-09-28: the page names CamScanner. It is the literal text on the reader's page and the
only word they search; naming it describes their problem, it does not compare products (no logo, no
us-vs-them).

## Scope

1. **Export check first.** A unit test that builds a CamScanner-shaped page (footer as its own image;
   footer as text plus a link annotation) and proves the exported file has no "CamScanner" text and no
   footer link after Delete or Whiteout. Then the same by hand on a real CamScanner PDF.
2. **The guide** in the content-pages collection, hub `redact`: Delete first, Whiteout when Delete
   selects the whole scan, phone and computer, with sketches.
3. **One `/redact/` FAQ entry** linking the guide.

Out of scope: a "same spot on every page" action (its own ticket if the page earns traffic).

## Acceptance

- The test is green in `check:fast`; the real-file check is recorded here with the file's structure.
- The page builds, passes `test:seo`, and its FAQ JSON-LD matches the page.
- Re-read GSC for "camscanner" queries four weeks after the page is indexed; record it here.
