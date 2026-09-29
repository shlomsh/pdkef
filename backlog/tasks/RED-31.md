---
id: "RED-31"
title: "Press and hold to peek under a blur, a whiteout or a brush stroke"
status: "open"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-31 · Press and hold to peek under a blur, a whiteout or a brush stroke

*Shlomi, 2026-09-29: hold to peek is wonderful.*

Answers "did I cover the right thing?" without undoing anything. Screen only; nothing about it reaches
the export or the saved state.

- **On a box:** press and hold still for 250ms and the box shows what is under it; release covers it
  again. Moving more than 3px before 250ms is a move, not a peek, so move and peek never collide.
- **Everywhere at once:** an eye button in the Redact toolbar, held down, shows the original page under
  every redaction on it. Holding Space does the same on desktop (not while typing in an input).
- Peek is a view state in the island, never written to the document model or the draft store.
- On iOS the long press must not open the callout or select text.

## Acceptance

- Holding still on a box reveals it; release restores it; a drag started on the box moves it without
  revealing.
- The eye button and Space reveal every redaction on the page and restore on release.
- An export taken right after a peek is byte-for-byte the same as one taken without it.

## Undo and redo

Peek is never a history entry and never changes `past` or `future`. Undo, redo or the undo chip used
while a peek is held act normally, and the peek ends on release as usual.
