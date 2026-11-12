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

- [ ] Guards green: `test:lazy-modules`, `test:request-count`, `test:precache-budget`, `test:weight`,
      `test:stable-names`, `test:css`, `test:csp`; pdf.js and pdf-lib still absent from every first paint.
- [ ] Offline specs and the Chromium suite pass.
- [ ] Measured live after landing: requests on a first visit to `/redact/` and `/sign/`.
