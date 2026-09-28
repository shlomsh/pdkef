---
id: "RED-28"
title: "A deleted object peels off like a sticker"
status: "done"
priority: "P3"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-28 · A deleted object peels off like a sticker

*2026-09-29.* The RED-13 lift (220ms, 4px up, fade) was easy to miss. Shlomi compared a stronger lift, a
wipe, a dissolve, a collapse and a sticker peel in mockups, picked the peel and tuned it in a live tuner:
top-right corner (where a right-to-left line starts), even pull, 500ms peel, 10° fold, 12% shadow, then a
160ms fly-off 18px up and away with 10° of spin.

- `peelGeometry.ts` is pure: one frame is the front's clip, the lifted part's clip, and the matrix that
  mirrors it in the fold line. Unit tests pin the start, the end, the corner and the fixed fold line.
- `DeleteLift.tsx` still waits for the page to be drawn without the object, then writes each frame to
  the DOM from `requestAnimationFrame`; state is never touched per frame. Reduced motion still creates
  no lift at all.
