---
id: "MERGE-01"
title: "A valid 3-page PDF renders a blank thumbnail in the Merge list"
status: "open"
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
