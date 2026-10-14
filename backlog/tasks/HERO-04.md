---
id: "HERO-04"
title: "Drop a file anywhere on a page-grid tool's page"
status: "open"
priority: "P2"
epic: "tool-pages"
horizon: "next"
order: 1
depends_on: ["HERO-02"]
needs: "Approve the drag-over caption, in English and Hebrew"
---

# HERO-04 · Drop a file anywhere on a page-grid tool's page

*Filed 2026-10-14.* From [docs/tool-hero-show-the-verb.md](../../docs/tool-hero-show-the-verb.md),
"Drop anywhere".

## Outcome

- A file dragged anywhere over the page lands in the tool. The island listens on `window` and acts
  only when `dataTransfer.types` includes `Files`, so Merge's page reordering and text drags pass
  through.
- A pure depth counter (`src/shell/useWindowFileDrop.ts`) flips state only on the enter and leave
  edges, never per `dragover`.
- The island sets `data-dragging` on its own root. Static CSS on `.tool-stage:has([data-dragging])`
  tints the first screen and lifts the verb, and the drop heading reads "Let go to add your files"
  ("your file" for a one-file tool). No island code touches the static DOM.
- The drop routes to the handlers that exist today, so accept filters and the replace confirmation
  are unchanged.

## Guards

- Unit: the depth counter, including nested enters and a leave to outside the window.
- Playwright (chromium): a file dropped on the hero's text column loads in the tool.
