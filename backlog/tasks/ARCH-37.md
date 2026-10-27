---
id: "ARCH-37"
title: "Opening a file is one hook per kind of tool"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 6
depends_on: []
---

# ARCH-37 · Opening a file is one hook per kind of tool

*Filed 2026-10-26* from the architecture review ([docs/architecture-debt-review-2026-10-26.md](../../docs/architecture-debt-review-2026-10-26.md), section 3).

## Why

Split (`:115-175`), Edit Pages (`:93-153`) and PDF to Image (`:98-152`) paste the same ~60-line
open path: picked-file guard, encryption probe, repaired copy, lazy `PageGrid`. Sign (1201 lines) and
Redact (1421 lines) duplicate their whole session skeleton, and the copies have drifted: only Sign
handles `launchQueue`, Redact's load announcements are hard-coded English, Redact's `:420` comment
says it mirrors Sign, and Sign hand-rolls export request ids (`:283-292`) where Redact uses
`lib/useLatestRun`.

## Outcome

- `useOpenPageDocument` (and its lazy `PageGrid` loader) in `src/shell/pageWorkspace/` is the one
  open path for Split, Edit Pages and PDF to Image.
- `useEditorFileSession` in `src/editor-ui/` (or the layer the boundaries doc names) owns load, add,
  recents, unique ids, draft persistence and `launchQueue` for Sign and Redact. Redact gains
  `launchQueue` as a result.
- Sign uses `useLatestRun` for export invalidation.
- The two editors share one fullscreen toggle, one undo/redo button pair and one `useCoarsePointer`
  with a single, documented meaning.

## Acceptance

- [x] Each island's open path is a hook call; the copies are gone.
- [x] Opening a PDF from the operating system ("Open with" on the installed app) works in Redact.
- [x] Existing unit and e2e tests for the five tools pass; the new hooks have unit tests, including
      an encrypted file and a stale pick replaced by a newer one.

## Progress (part A: useOpenPageDocument)

- `src/shell/pageWorkspace/useOpenPageDocument.ts` is the one open path for Split, Edit Pages and
  PDF to Image: stale-pick guard, encryption probe, repaired copy, load status. A tool picks a
  `loader` (`repairedPdfLoader` for pdf-lib tools, `thumbnailPdfLoader` for PDF to Image) and which
  protection kinds stop it (`unlockKinds`). `useLazyPageGrid.ts` owns the lazy `PageGrid` import.
- Differences found between the three copies: PDF to Image gates only on a password (an
  owner-restricted file renders) and reads with pdf.js, reporting under `pdf_render`; Split also
  tracks rejected non-PDF files (kept in the island, before `open`); per-tool resets differ (mode,
  page numbers, name). Drift unified: Edit Pages' `useCallback` omitted the announcement strings
  from its dependencies (a stale-message bug for localized editions), now read through the hook's
  latest-options ref.
- Unit tests: `useOpenPageDocument.test.tsx` (ordinary PDF, repaired copy, encrypted, owner-restricted
  pass-through, stale pick, damaged PDF, replace vs add).

## Progress (part B: editor session)

- `useEditorFileSession` (`src/editor-ui/hooks/`) owns load, add, recents, unique ids, draft persistence and `launchQueue` for Sign and Redact. Redact now handles "Open with" in the page. Redact's English announcements default inside the hook (`messages`), one place.
- Sign's export invalidation uses `lib/useLatestRun`; the hand-rolled request ids are gone.
- One `UndoRedoButtons`, one `toggleWorkspaceFullscreen` / `useFullscreenChange`, one `useCoarsePointer` (`(pointer: coarse)`, read on the first render) in `editor-ui`.
- Still open for this outcome: the manifest's `file_handlers` routes only to `/sign/`, so the installed app's "Open with" never reaches `/redact/`; see the manifest finding in the commit report.

## Status 2026-10-27

The hooks landed (parts A and B) and Redact handles `launchQueue`. Shlomi chose the chooser (option B):

- `file_handlers` now points at `/open/` (`src/pages/open.astro`, noindex, not in the sitemap or the Markdown twins).
  Its island, `src/site-lib/OpenWithChooser.tsx`, takes the launched PDF from `launchQueue`
  (`openWithLaunch.ts`), shows "Sign it" and "Redact it", and parks the bytes through `sendHandoff`, so the tool
  opens it exactly as it opens a home-page file. Visiting `/open/` with no file shows plain links to both tools.
- Redirect pair for `/open` in `vercel.json`; `/open/` is exempt from the SoftwareApplication and Markdown-twin
  checks like `/licenses/`.
- Verified on a production build with a simulated `launchQueue` (Chromium defines `window.launchQueue` itself, so
  a test must `defineProperty` it): the chooser shows the file name, and Sign and Redact both open the PDF. Not
  verified: a real "Open with" from Finder or Explorer on an installed app (the manifest change reaches an
  installed app on its next manifest update).
- Sign keeps its own `launchQueue` consumer, for installs whose manifest still says `/sign/`.
