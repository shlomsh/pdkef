---
id: "MERGE-01"
title: "A valid 3-page PDF renders a blank thumbnail in the Merge list"
status: "done"
priority: "P1"
epic: "merge-tool"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
---

# MERGE-01 · A valid 3-page PDF renders a blank thumbnail in the Merge list

*Filed 2026-09-13* from the Merge review (plan: https://claude.ai/code/artifact/32d70100-d85a-458c-9f66-8679ad4edb18).

## Scope and acceptance

On the deployed `/merge/`, a 3-page PDF generated with `@cantoo/pdf-lib` (a coloured header
rectangle and twenty lines of Helvetica-Bold text per page, object streams on, 4,994 bytes) renders a
150 x 194 thumbnail with **zero non-white pixels**, twice in a row, while a 1-page and a 2-page file
from the same generator render correctly. The `<img>` is present and loaded, so the render path did not
reject; it painted nothing. The reproduction file was handed to Shlomi in chat as
`blank-thumbnail-repro.pdf`; the first task is to check it into `scripts/fixtures/` (or generate it in
`generate-test-fixtures.mjs`) so the fix has a test.

Where to look, in order: `renderThumbnail` in `src/lib/thumbnails.js` (page-1 render, the white
prefill, `getPdfRenderContext`), whether the same bytes render in `renderPdfThumbnails` (Edit Pages),
and whether the failure follows the page count, the object-stream layout or the font resource naming.
Do not paper over it with a retry.

**Acceptance.**

- The fixture is in the repo and a unit test asserts its page-1 render has non-white pixels (jsdom
  cannot run pdf.js; if the test needs a browser, it is one Playwright check under `e2e/merge/`).
- Root cause written in the ticket in two sentences.
- `npm test`, `npm run typecheck`, and the Merge e2e spec green.

## Root cause

The reported blank page 1 was not a rendering bug: the 4,994-byte reproduction PDF reached the
deployed page as a hand-typed base64 string inside a browser script, and that transcription changed
two bytes inside page 1's FlateDecode content stream (the true file, checked by SHA-256 and by Node's
zlib, decodes every page; Chromium's DecompressionStream rejects the retyped copy with "invalid
literal/lengths set"). pdf.js then did what it does for any undecodable content stream with
`ignoreErrors` on: it logged `getContentStream - ignoring sub-stream (6R)`, resolved `page.render()`
against an empty operator list, and painted a white 150 x 194 canvas, twice, for the same corrupted
bytes.

Evidence (2026-09-13): the real bytes set through the file input on the deployed `/merge/` render
7,704 non-white pixels in Playwright Chromium and 8,304 in WebKit, twice in a row; the same in this
build (`e2e/merge/thumbnail-render.spec.js`); real pdf.js in Node reports 220 operators on each of
the three pages. The lead reproduced the "blank" result itself by injecting the file the same way,
which is how the artifact was recognised: the injected copy differed from the fixture at two byte
positions. A first write-up by the thumbs lane blamed pdf.js's JS FlateDecode on page 3; that was
the same injection artifact landing on a different byte and is withdrawn.

What remains true and is kept: `renderPdfThumbnails` (the Edit Pages path) had no white prefill, so
a page pdf.js silently drops came back transparent rather than white; every render now goes through
one `renderPageToDataUrl` with the prefill and an abort contract. pdf.js swallowing a content-stream
error into a blank page is upstream behaviour and is left alone. Lesson for the repo: never feed a
binary fixture to a page by retyping it; use `setInputFiles` (Playwright) or a served URL.

## Updates

- 2026-09-13: `three-page-header.pdf` added to `scripts/generate-test-fixtures.mjs` (a second,
  independently generated 3-page fixture with the same shape) and `e2e/merge/thumbnail-render.spec.js`
  added as the real-browser guard: it sets `blank-thumbnail-repro.pdf`, `three-page-header.pdf` and
  `num-1.pdf` through the file input on `/merge/`, decodes each list thumbnail back into a canvas and
  asserts non-white pixels, in both the `chromium` and `webkit` Playwright projects. `src/lib/thumbnails.js`
  gained `openThumbnailSource()` (one lazy pdf.js document per file, abortable renders that cancel the
  pdf.js `RenderTask`), `renderThumbnailWithMeta()` (page 1 plus `pageCount`, `width`, `height`;
  `renderThumbnail` is a wrapper over it) and `renderPdfThumbnails(file, cb, { width, type, quality,
  signal, pageIndices })` over the same source, with the white prefill. Unit tests in
  `src/lib/thumbnails.test.js`. Done.
