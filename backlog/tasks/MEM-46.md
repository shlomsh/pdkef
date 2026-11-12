---
id: "MEM-46"
title: "Shared late code that never touches the PDF writer rides in the first-paint files"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-46 · Shared late code that never touches the PDF writer rides in the first-paint files

*Filed 2026-11-12*, merge 2 of the four in [docs/offline-and-requests.md](../../docs/offline-and-requests.md).

## Why

A tool page installs everything on its first visit (MEM-43), so a late file costs a request without saving a
byte. /redact/ installs six late files: `redact-late`, `editor-late`, `tools-late`, `signals`, `sha256` and
`swInstallReport`.

The first plan folded every tool's late code into its own late file. A module lives in one file only, so shared
late code cannot also sit inside each tool's file. Folding a tool's late code into its first-paint file is out
too: `redact-late`, `sign-late`, `highlight-late`, `compress-late` and `editor-late` import the PDF writer
(`pdf-lib.js`, 210 KB brotli) statically, so it would become first-paint code. Owner's choice (2026-11-12): the
safe folds only.

## What

- `tools-late` (no PDF engine in its imports, and every tool page installs it) joins `tools-common`.
- `swInstallReport` (loaded by `site.js` on every page with a worker) joins `site`.
- `signals` and `sha256` go into the UI glue file of merge 3, not here.
- The guards that key on file names are re-keyed: `tools-late.js` and `swInstallReport.js` must not be built,
  and the request and lazy-file budgets drop to the new figures. First-paint script on tool pages grows by about
  16 KB brotli; the owner approved that rise on 2026-11-12.

## Done when

- [x] Guards green: `test:lazy-modules`, `test:request-count`, `test:precache-budget`, `test:weight`,
      `test:stable-names`, `test:css`, `test:csp`; pdf.js and pdf-lib still absent from every first paint.
- [x] Offline specs and the Chromium suite pass.
- [x] Measured live after landing (2026-11-12): `/redact/` 40 (was 43). `/sign/` was not read at that step; the later MEM-48 reading is 32.

## Result (build, 2026-11-12)

`npm run test:request-count`: `/redact/` 43 to 40, `/sign/` 44 to 41, `/` after a file is opened 9 to 8. The tool
pages lose three requests, not two: `tools-late`'s stylesheet went with it into `tools-common`'s. Bytes a first
visit to /redact/ downloads: 1,139 to 1,137 KB brotli. `tools-common.js` 59 to 73 KB brotli (also on `/drive/`,
which loads it), `site.js` +0.3 KB. A second tool after Redact costs the same as before. A returning visitor
re-downloads, once, every file whose import list changed: about 240 KB brotli for a Redact visitor. Unit suite,
offline specs (34) and the Chromium suite pass; first-paint weight stayed inside its budgets, so no budget rose.
