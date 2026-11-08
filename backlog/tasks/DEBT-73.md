---
id: "DEBT-73"
title: "A drag or resize that replaces a live gesture keeps its own started flag"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "next"
depends_on: []
---

# DEBT-73 · A drag or resize that replaces a live gesture keeps its own started flag

*Filed 2026-11-08, from the implicit state machine inventory.* Both shared gesture hooks in
`src/editor-ui/hooks/` set the new gesture's flag first and then cancel the outgoing gesture. The
outgoing gesture's `cancel()` resets the same flag:

- `useDraggableElement.js`: `isDragging.current = true` (`:194`), then `cancelDragRef.current?.()`
  (`:196`), whose cancel sets `isDragging.current = false` (`:321`). The new drag then runs with
  `isDragging` false, so `DraggableWrapper`'s re-render effect
  (`src/tools/sign/components/DraggableWrapper.tsx:250`) does not reapply the drag transform when the
  element re-renders mid-drag.
- `useElementResize.js`: `setIsSpanResizing(true)` (`:151`), then `cancelResizeRef.current?.()`
  (`:289`), whose cancel calls `setIsSpanResizing(false)` (`:317`). The last update in the batch wins,
  so a text span resize starts without the Preact-owned preview nodes the comment at `:140` says it
  needs.

This only happens when a gesture starts while the previous one has not released (a second pointer, or
a missed `pointerup`). The MOBI-21 comment at `:198` already moved `tapCandidate` after the cancel for
this exact reason; the flag above it was left behind.

## Acceptance

- In both hooks the outgoing gesture is cancelled before the new gesture sets its flag.
- A unit test per hook starts a second gesture over a live first one and asserts the flag reads as
  started.
- `npm run test:gesture-golden-rule` stays green.

## Outcome
