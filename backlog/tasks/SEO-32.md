---
id: "SEO-32"
title: "New tool: PDF to Markdown, English-only v1, Hebrew/RTL deferred pending anydoc-wasm's dependency bump"
status: "open"
priority: "P3"
epic: "search-acquisition"
phase: "later"
depends_on: []
legacy_state: "Open"
---

# SEO-32 · New tool: PDF to Markdown, English-only v1, Hebrew/RTL deferred pending anydoc-wasm's dependency bump

## Scope and acceptance

ilovepdf has shipped this (https://www.ilovepdf.com/pdf-to-markdown), and it fits the suite: a
document-to-document conversion alongside Merge/Split/Compress, no server round trip needed. No search
volume has been measured yet for this one (no GSC data exists pre-launch, and this repo cannot fetch
Google SERPs directly - ask Shlomi for a screenshot or a manual check before treating it as validated
demand, not just a competitive-parity move).

**This was evaluated and rejected once already; the rejection reason is now scoped away, not gone.**
`@firecrawl/anydoc-wasm` (MIT, Rust->WASM, ~2.9 MB gzip, fully on-device - see engine spike in memory
`project-anydoc-pdf-markdown-spike` for the full record) was rejected 2026-08-07 because Hebrew text
comes out character-reversed 68% of the time, traced to an upstream bug in `pdf-inspector`. That bug is
specific to RTL script direction inference and does not touch English extraction - the same spike notes
plain single-column English body prose extracts very well on this engine. The proposal here is to ship
English-only now and bump the dependency once RTL is fixed upstream, rather than continue blocking the
whole tool on a bug that only affects some scripts.

**The RTL fix is not in the published package yet - do not start this expecting Hebrew to work.**
`pdf-inspector` 1.16.0+ (merged 2026-08-21) fixes it, but `@firecrawl/anydoc-wasm` still pins 1.14.2 as
of 0.2.4 (2026-08-27, checked again 2026-09-12). Tracked upstream at
https://github.com/firecrawl/anydoc/issues/170 (filed by us, open, no response). Re-check that issue
and `npm view @firecrawl/anydoc-wasm versions` before starting, and again before localizing this tool
into `/he/` - shipping it there while the bug is live would reproduce the original failure for exactly
the audience it's meant to serve.

**Two things flagged in the spike as unresolved, independent of the RTL bug - verify before committing
to scope, not just trusting the 2026-08-07 note:**

- Structure inference over-fires on complex layout: drop caps become `<h1>`s, mid-sentence fragments
  become `<h5>`s, prose gets column-detected into bogus tables that drop content. Not re-tested since
  the original spike. Run a handful of real English PDFs (including at least one non-trivial layout)
  through `@firecrawl/anydoc-wasm@0.2.4` before scoping the tool, not just single-column prose.
- 32% of the original 179-PDF corpus failed outright (52 `unsupported` = scanned/image-only PDFs, 4
  `malformed`, 1 `encrypted`) - there is no OCR path on-device. That ceiling applies to English PDFs
  too and must be a disclosed limitation on the page ([[project_seo_pages_need_real_value]] - no
  silently-wrong output, no doorway-page vagueness about what fails), not hidden behind a generic error.

**Acceptance.**

- English-only for v1; the page states this plainly rather than silently mis-handling other scripts.
  No `/he/` (or other RTL-language) edition ships until anydoc-wasm's `pdf-inspector` dependency is
  confirmed >= 1.16.0.
- Conversion runs fully on-device via `@firecrawl/anydoc-wasm`; no file bytes leave the device (the
  one invariant this whole app exists to protect).
- The page discloses, in plain language: what fails outright (scanned/image PDFs need OCR we don't
  have), and that structure inference is heuristic and can misread complex layouts - point to manual
  review of the output rather than implying a guaranteed-correct conversion.
- Real `src/lib/` logic, unit-tested; no network calls.
- Registered in `src/data/tools.js`; How it works and FAQ with matching `<SeoSchema>`; no `noindex`.
- Runtime dependency passes `npm run test:licenses` (anydoc-wasm is MIT - confirm no change since the
  spike).
- `npm run build && npm run preview` CSP and hydration pass.
- Ships alone in its week.
