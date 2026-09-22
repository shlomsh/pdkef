---
id: "DEBT-20"
title: "Every tool page ships the whole of pdf-lib before anyone opens a file"
status: "in_progress"
priority: "P2"
epic: "architecture-debt"
phase: "near-term"
depends_on: []
---

# DEBT-20 · Every tool page ships the whole of pdf-lib before anyone opens a file

*Filed 2026-09-22 from five PageSpeed Insights runs on `/redact/` (Lighthouse 13.5.0). The trigger was
unrelated: a Search Console reading that turned out to be an artefact. The performance reads were the
real finding.*

## What is measured

Desktop and mobile disagree, and the disagreement is the finding:

| | Mobile (Slow 4G, 4x CPU) | Desktop (custom throttling) |
| --- | ---: | ---: |
| FCP / LCP | 1.9s / 2.9s | 0.6s / 0.7s |
| CLS | 0 | 0 |
| **TBT** | 70 ms | **1,250 ms** |

Mobile's 70 ms is the misleading number. On a slow connection the chunks dribble in and the work
spreads out or lands past the trace window; on a fast one they all arrive at once and the main thread
parses, compiles and executes 880 KB of JavaScript in a burst. Main-thread work totals 2.7s:

| Category | Time |
| --- | ---: |
| Style & Layout | 995 ms |
| Other | 610 ms |
| Script Parsing & Compilation | 486 ms |
| Script Evaluation | 402 ms |
| Parse HTML & CSS | 78 ms |
| Garbage Collection | 77 ms |
| Rendering | 8 ms |

So this is two problems of comparable size, and the ticket has a phase for each. Script parse plus
evaluation is 888 ms. Style & Layout alone is 995 ms.

## Phase 1: pdf-lib loads eagerly on every tool page (mechanism known, do this first)

*Corrected 2026-09-22 against a local build of `ea27a26`, measured rather than read off PageSpeed.
**pdf.js is already lazy and was never the problem.** The filing above named it because
`useCurrentPage.CfYKUDBY.js` matched a grep for `GlobalWorkerOptions`; that chunk holds the Vite
dependency table for a dynamic import of pdf.js, not pdf.js. pdf.js is its own chunk,
`pdf.Zn9K1YuS.js`, 421.1 KiB raw / 103.4 KiB brotli, and it is absent from every tool page's eager
graph, because `src/editor/adapters/pdf/pdfjsLoader.js` already does exactly what this phase has to
do for pdf-lib. That loader is the pattern to copy, not a second problem to fix. The ticket now says
one library, and the win is smaller than the filing claimed and spread over more pages.*

**What is actually eager.** Walking each built page the way a browser does (entry points from the
HTML: `<script src>`, `modulepreload`, and the island's `component-url`/`renderer-url`; then static
imports only, never `import()`):

| Chunk | Contains | Raw | Brotli | Eager on |
| --- | --- | ---: | ---: | --- |
| `es.BgsW4Ji1.js` | **pdf-lib** (`PDFDocument`, `StandardFonts`, `decodePDFRawStream`) | 628.6 KiB | 215.5 KiB | **all 11 tool pages** |
| `useCurrentPage.CfYKUDBY.js` | the shared Sign/Redact editor chunk | 233.7 KiB | 49.7 KiB | `/sign/`, `/redact/` |
| `pdf.Zn9K1YuS.js` | **pdf.js** | 421.1 KiB | 103.4 KiB | nothing (already lazy) |

Rollup names a shared chunk after one of its constituent modules, so neither name is a clue to its
contents. `useCurrentPage.js` is a small hook; the 233.7 KiB beside it is the rest of the editor, and
it is wanted at first paint. `es.` is pdf-lib because `@cantoo/pdf-lib`'s package entry is `es.js`.
Verify a chunk by grepping the built file, never by its name.

Per-page eager JS, raw / brotli, before any change:

| Page | Eager JS | Of which pdf-lib |
| --- | ---: | ---: |
| `/sign/` | 1034.9 KiB / 319.1 KiB | 61% / 68% |
| `/redact/` | 982.5 KiB / 306.2 KiB | 64% / 70% |
| `/merge/` | 781.0 KiB / 266.5 KiB | 80% / 81% |
| `/edit-pdf/` | 742.7 KiB / 254.1 KiB | 85% / 85% |
| `/image-to-pdf/` | 738.9 KiB / 253.1 KiB | 85% / 85% |
| `/compress/`, `/compress-image/` | 727.5 KiB / 248.7 KiB | 86% / 87% |
| `/split/` | 725.5 KiB / 249.3 KiB | 87% / 86% |
| `/pdf-to-image/` | 703.9 KiB / 242.0 KiB | 89% / 89% |
| `/unlock/` | 699.9 KiB / 240.6 KiB | 90% / 90% |
| `/he/` | 761.8 KiB / 255.7 KiB | 83% / 84% |

The content and marketing pages carry 3.6 KiB raw of JS and are not affected; the SEO surface is
clean, as designed. Note `/pdf-to-image/` and `/unlock/` in that list: neither tool uses pdf-lib on
its own first screen at all, and both still ship all of it.

Lighthouse quantifies the waste independently on `/redact/`: **"Reduce unused JavaScript", 172 KiB
estimated savings, of which `es.BgsW4Ji1.js` alone is 145.4 KiB.** About 60% of pdf-lib is
downloaded, parsed and compiled without being called during page load.

pdf-lib is not needed until a file is opened. Every visitor who lands from search and leaves without
choosing a PDF pays for all of it, on all eleven pages.

**How they become eager.** Static value imports, transitively reachable from the island's
`component-url`:

- `src/editor/adapters/pdf/pdfObjects.js` - `PDFName`, `PDFArray`, `PDFDict`, `PDFStream`, `decodePDFRawStream`
- `src/editor/adapters/pdf/redact.js`, `deleteObjects.js`, `pageInk.js` - `PDFDocument`, `PDFName`
- `src/editor/registry/{symbol,ellipse,line,rectangle,whiteout}.ts` - **`rgb` and `LineCapStyle` only**

The registry five are the awkward part and the reason this is not a one-line fix. They import a pure
function and an enum, and that is enough to drag 643 KB. `textPdf.ts` and `types.ts` import from the
same package but are type-only, so they already cost nothing; keep it that way.

**The guard already exists.** `scripts/check-lazy-modules.js` walks the built output the way a browser
does, follows static imports from each page's real entry points, counts a `modulepreload` as eager, and
deliberately does not follow dynamic `import()`. Its `LAZY_ONLY` list today covers only the five
form-detection chunks. Its own header anticipates this case:

> a new source (OCR, metadata extraction) is exactly the kind of thing that must not land in everyone's
> first paint

Both PDF libraries are 5x larger than everything that list currently protects.

## Phase 1 landed 2026-09-22

pdf-lib is in no page's eager graph. Measured by walking the built output the
way a browser does, same method as the before table:

| Page | Eager JS before | after | raw cut |
| --- | ---: | ---: | ---: |
| `/sign/`, `/he/sign/` | 1034.9 KiB / 319.1 KiB | 407.9 / 105.2 | -61% |
| `/redact/` | 982.5 / 306.2 | 341.8 / 87.8 | -65% |
| `/merge/`, `/he/merge/` | 781.0 / 266.5 | 154.0 / 51.9 | -80% |
| `/edit-pdf/` | 742.7 / 254.1 | 115.6 / 39.5 | -84% |
| `/image-to-pdf/` | 738.9 / 253.1 | 111.4 / 38.3 | -85% |
| `/compress/`, `/compress-image/`, `/he/compress/` | 727.5 / 248.7 | 100.1 / 33.9 | -86% |
| `/split/` | 725.5 / 249.3 | 98.4 / 34.8 | -86% |
| `/pdf-to-image/` | 703.9 / 242.0 | 76.0 / 27.0 | -89% |
| `/unlock/` | 699.9 / 240.6 | 72.4 / 25.8 | -90% |
| `/he/` (home) | 761.8 / 255.7 | 133.8 / 40.6 | -82% |

Raw / brotli in each cell. The Hebrew home page is in that list because it was
in the problem: it carried all of pdf-lib through the editor registry, and
nothing said so.

**How it was done**, in two halves, because the callers split in two:

1. **Nine modules only ever wanted a value**, not the library: the five shape
   entries in `src/editor/registry/` (`rgb`, `LineCapStyle.Round`) and
   `src/lib/pageOps.js` (`rgb`, `degrees`, `StandardFonts.Helvetica`), all
   called from functions that are synchronous by contract and so can never
   await anything. Every one of those four names is a plain literal in pdf-lib.
   They now come from `src/lib/pdfLiterals.ts`, which reimplements them and is
   pinned to the real package by `pdfLiterals.test.ts` (imports pdf-lib, which
   is free in node, and asserts each value still equals it). This half alone
   cleared `/sign/`, `/pdf-to-image/` and both home pages, because
   `registry/index.ts` builds its map at module top level and so made all five
   shapes reachable from every editor island.
2. **Everything that wants the real library** now loads it through
   `src/lib/pdfLib.js` (`getPdfLib()`), from a call site that already runs after
   a file is chosen. It memoizes the in-flight promise rather than the resolved
   module, since Merge inspects a selection of files concurrently, and clears it
   on rejection so a retry is a real retry. The adapter modules under
   `src/editor/adapters/pdf/` keep their own static pdf-lib imports on purpose:
   once nothing reaches them eagerly they fall into the lazy chunk by
   themselves, and rewriting `pdfObjects.js`'s 40 synchronous call sites to
   await a namespace would have been a far larger change for no gain.

One function changed signature: `addFileOutline` in `src/tools/merge/outline.js`
is now async, with five call sites updated (one in `merge.js`, four in its test).
Nothing else did.

**pdf.js needed no work.** It was already lazy behind
`src/editor/adapters/pdf/pdfjsLoader.js`. It is now in `LAZY_ONLY` anyway, so
the thing that was quietly true is guarded.

**The guard.** `scripts/check-lazy-modules.js` now checks fifteen pages rather
than five (all ten tool pages, the three localized tool pages, and both home
pages), and each row carries a `reachableFrom` list, replacing the single
hardcoded `OWNER = 'sign'`. That second half matters as much as the first:
absence alone is cheap to satisfy by deleting the feature, so each row also
names pages that must still reach the chunk lazily. `astro.config.mjs` now names
pdf-lib's chunk `pdf-lib.<hash>.js` instead of `es.<hash>.js`, so the guard keys
on something unambiguous and the next PageSpeed report reads itself.

The guard paid for itself twice during the change. Naming a manual chunk for
pdfjs-dist as well looked obviously right and was wrong: Rollup folded Vite's
`__vitePreload` helper into it, the island bootstrap imports that helper
statically, and all 421 KiB of pdf.js went eager on all fifteen pages. The
guard failed the build both times. That rule is reverted, with the reason
written where the next person will try it again.

**Why the page-weight budget did not catch any of this.** `test:weight` passes
today at 148,596 of 400,000 brotli on its worst page. Adding pdf-lib's 215 KiB
back still lands under that budget. A budget set for documents plus eager JS
cannot see a single library that every page carries and no page uses; the graph
guard can. Do not respond to that by tightening the budget.

**Still open in Phase 1:** re-run PageSpeed on `/redact/` desktop and record the
TBT after, against the 1,250 ms before. That needs the change deployed, since
CrUX and Lighthouse both read the live URL.

## Phase 2: 995 ms of Style & Layout, cause unknown (profile before changing anything)

The obvious suspects were measured on the live page and do not account for it:

```
DOM elements:    394          (Lighthouse warns around 800; "Optimize DOM size" came back unscored)
inline CSS:      85,577 bytes
  rule blocks:   916
  @media blocks: 53
  custom props:  162 declared, 684 var() uses
```

916 rules over 394 elements should not cost 995 ms. The likeliest explanation is repeated style
recalculation during island hydration, possibly forced synchronous layout, but that is a hypothesis and
nothing should be changed on it. **This phase starts with a Chrome performance trace of hydration on
desktop**, and the trace decides what, if anything, moves.

Explicitly not the plan: trimming CSS by guess, or raising any ratchet. Per CLAUDE.md the fix is to
narrow what a page carries, based on evidence about which selectors are costing recalculation.

## Acceptance

Phase 1:

- pdf-lib appears in no tool page's eager set; it loads on the file-opened path. Re-measure every
  page in the table above and record the after beside the before, brotli included.
- pdf-lib's chunk is added to `LAZY_ONLY` in `check-lazy-modules.js` with the non-vacuity check still
  passing. Two things stand in the way and both are part of this phase: `LAZY_ONLY` is applied to
  every page in `PAGES` with no per-page scoping (fine here, since the claim is global), and the
  chunk is named `es.<hash>.js` after the package entry, which is too generic to key a guard on. Give
  the dynamic import a local module to hang off so the chunk gets a stable, honest name, the way
  `pdfjsLoader.js` does. `PAGES` is also stale at five entries; the measurement above covers eleven.
- pdf.js stays lazy. Add it to `LAZY_ONLY` too, so that the thing already true is guarded and cannot
  regress unnoticed - that is cheap and it is how this was missed.
- `test:editor-dependency-directions`, `test:module-boundaries` and the full unit suite stay green;
  `.claude/rules/editor.md` governs the editor-core edits.
- Re-run PageSpeed on `/redact/` **desktop**, which is the configuration that exposes this. TBT is the
  number to move; record the before (1,250 ms) and after here.

Phase 2:

- A trace is attached or summarized here before any CSS or DOM change is proposed.
- If the trace exonerates the CSS, say so and close the phase. A measured "not this" is a result.

## Why P2 and not P1

Nothing here loses a document or exposes one, which is what earned DEBT-18 its P1. This is quality: the
page paints in 0.7s and then blocks for over a second, on the tool that is the site's strongest
franchise. It is near-term because the JS half is understood, quantified by Lighthouse's own audit, and
has a guard waiting to hold it.

## What this is not

Not an SEO fix. Core Web Vitals rank on field data, and CrUX reports "No Data" for this page at current
traffic, so none of these lab numbers is a ranking input today. Do not justify this work with search
performance; justify it with the 1,250 ms.
