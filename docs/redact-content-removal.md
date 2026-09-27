# Redact: removing what is under a box (RED-01 record)

*RED-01, 2026-09-27. The spike's code, corpus and full tables live in `spikes/red-01/`
(`results-summary.md`, `pdfium/results.md`). This is the decision and the plan.*

## Where we are

Today every page with a Blur, Blackout or Whiteout box is exported as one JPEG
(`src/editor/adapters/pdf/redact.js`). The secret is gone, but so is every other word's text on that
page: nothing can be selected, searched or read aloud. The goal is to remove only the glyphs, image
pixels and marks under each box and leave the rest of the page as it was.

## What we measured

Two engines against a 21-file corpus built to break them (single-run secrets, kerning arrays, subset
TrueType, Hebrew, rotated pages and text, form XObjects, partly covered images, a FreeText annotation,
three real government forms). A pass means: the secret can't be extracted under the box, the words
beside it on the same line survive, other text survives, and no annotation under the box still holds
the secret (`spikes/red-01/check-extractable.mjs`, `check-images.mjs`).

| | Our own content-stream parser | PDFium (`@embedpdf/pdfium`, WebAssembly) |
| --- | --- | --- |
| Passes | 12 of 21 | 17 of 21 |
| Secret inside one text run | Fails: deletes the whole run, so the words beside it go too | Passes: rebuilds the run around the secret, glyph by glyph |
| Two secrets in one run | Fails (collateral) | Passes, no cross-corruption |
| Real forms (IRS 1040, USCIS I-9, Israeli health declaration) | 2 of 3 | 3 of 3 |
| Hebrew, secret mid-run | Fails (whole line) | **Fails: the surviving words come back reordered and 1-2 letters short** |
| Form XObjects | Fails (never descends) | Fails (inspected, not edited) |
| Annotations | Fails (untouched) | Fails (untouched) |
| Partly covered image | Fails (whole image removed) | Pixels right; an invisible caption leaked a fragment |
| 77 pages, one box each | not measured | 119 ms |

PDFium costs 7.3 MB of WebAssembly (2.8 MB compressed), MIT wrapper around an Apache-2.0 binary,
both on the license allowlist.

## Decision: go, with PDFium, gated on one question

PDFium is the engine: it is the only one that removes a secret from the middle of a line without
taking the line with it, which is the common case in real documents. Our own parser stays out.

The gate is Hebrew. A Hebrew user redacting one word and finding the words beside it scrambled would
break the promise this tool is built on, so nothing ships until RED-05 answers whether we can keep the
surviving glyphs intact (re-emit their original glyph codes instead of re-encoding text) or must fall
back for that run.

## How it behaves

- **Removal first, flattening as the fallback, per page.** Each page is removed-in-place when the
  engine can do it and the check below passes; otherwise that page alone is exported the way it is
  today. A document is never all-or-nothing.
- **Verified, not assumed.** After every export we read the file back: no text, image pixels or
  annotation text left under any box, and all text outside the boxes unchanged from the original.
  Any page that fails is re-exported flattened. Search (RED-02) run on the result is the person's own
  spot-check, not the proof: it only finds what they think to look for.
- **The person is told, plainly.** The done state says which pages kept their text and which were
  saved as an image, and why ("Page 3 was saved as a picture, so its text can't be selected"). No
  security jargon.
- **Loaded only on export.** The WebAssembly loads when someone exports from Redact or Sign, never
  with the page, and is cached for offline use after the first export.
- **Sign uses the same engine** for its Whiteout, which today covers content that stays in the file.
- **RED-04 (what you see is what you save)** renders the real, verified output back into the editor;
  it builds on this, not beside it.

## The build, as tickets

| Ticket | What | Depends on |
| --- | --- | --- |
| RED-05 | Spike: Hebrew and Arabic survivors of a partial rebuild keep their glyphs and order | - |
| RED-06 | PDFium loads on export only, in a worker, cached offline, inside the weight budgets | - |
| RED-07 | Remove text, image pixels and paths under each box, with per-page flattening fallback | RED-05, RED-06 |
| RED-08 | Annotations, form field values and form XObjects under a box | RED-07 |
| RED-09 | Read-back check after every export, and the done state that tells the person per page | RED-07 |
| RED-10 | Sign's Whiteout removes what it covers, through the same engine | RED-09 |

RED-04 now depends on RED-09.
