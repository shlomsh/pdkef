---
id: "DEBT-20"
title: "Every tool-page visitor downloads and compiles both PDF libraries before opening a file"
status: "in_progress"
priority: "P2"
epic: "architecture-debt"
phase: "near-term"
depends_on: []
---

# DEBT-20 · Every tool-page visitor downloads and compiles both PDF libraries before opening a file

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

## Phase 1: the two PDF libraries load eagerly (mechanism known, do this first)

`/redact/` ships 405.6 KiB, of which 370.6 KiB is JavaScript in 21 chunks. Two of them are 83% of it,
and Rollup's names hide what they are:

| Chunk | Actually contains | Transfer | Unpacked |
| --- | --- | ---: | ---: |
| `es.BgsW4Ji1.js` | **pdf-lib** (`PDFDocument`, `StandardFonts`, `decodePDFRawStream`) | ~245 KiB | 643,720 B |
| `useCurrentPage.CfYKUDBY.js` | **pdf.js** (`GlobalWorkerOptions`, `getDocument`) | 60.3 KiB | 239,331 B |

The other 19 chunks are 61.8 KiB combined. `useCurrentPage.js` is a two-line hook that imports only
`preact/hooks`; Rollup named a shared chunk after it, so the size is not a clue to the contents. Verify
a chunk's identity by grepping the built file, not by its name.

Lighthouse quantifies the waste independently: **"Reduce unused JavaScript", 172 KiB estimated
savings, of which `es.BgsW4Ji1.js` alone is 145.4 KiB.** About 60% of pdf-lib is downloaded, parsed and
compiled without being called during page load.

Neither library is needed until a file is opened. Every visitor who lands from search and leaves
without choosing a PDF pays for both.

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

- Neither PDF library appears in any tool page's eager set; both load on the file-opened path.
- Both chunks are added to `LAZY_ONLY` in `check-lazy-modules.js`, keyed on whatever the chunks are
  named after the change, with the non-vacuity check still passing.
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
