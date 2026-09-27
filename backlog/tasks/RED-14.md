---
id: "RED-14"
title: "Redact island refactor: one commit path, linked-box and Delete hooks, typed elements, shared tool icons"
status: "in_progress"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-14 · Redact island refactor: one commit path, linked-box and Delete hooks, typed elements, shared tool icons

*Filed 2026-09-28 after RED-11 and RED-13 landed.* `PdfRedactTool.tsx` grew by accretion across
RED-02, 03, 11 and 13 to 1,384 lines and 40 `useState`/`useRef`, and every Redact ticket collides in it.
Behaviour stays identical; the existing unit and e2e suites are the safety net.

- **One commit path.** Every edit is "change `elements`, mark the document edited, clean selection,
  push one history entry, maybe show the undo chip". `useRedactCommands` does that once; the handlers
  only decide what changes. `removeGroup` and `removeFindSet` stop being copies of each other.
- **Links in one pure module.** `links.ts` merges a box's repeat-group and find-set changes
  (`linkedChanges`), replacing the hand merge in `updateElement`.
- **Feature hooks.** `useDeleteTool` (deletable objects, previews, lifts, marking) and
  `useLinkedBoxes` (repeat, duplicate, unlink, remove a set) leave the island with layout and wiring.
- **Typed elements.** A Redact element union replaces `[field: string]: unknown` where it can, so the
  delete element's `start`/`end` are numbers, not `unknown`.
- **Dead code.** The "un-mark if already marked" branch in `toggleObjectDeletion` can't run: a marked
  object is no longer offered.
- **Shared tool icons.** `src/editor-ui/toolIcons.tsx` holds the Whiteout slot, the eraser and the
  trash, used by both editors.

## Acceptance

- No behaviour change: `check:push` green, and the Redact and Sign e2e unchanged.
- `PdfRedactTool.tsx` loses the feature logic (target under 900 lines), with no copied commit blocks.
