---
id: "ARCH-02"
title: "Relocate the shared page-coordinate transform into editor/geometry"
status: "done"
priority: "P2"
epic: "editor-architecture"
phase: "unspecified"
depends_on: ["SIGN-05"]
legacy_state: "Done 2026-08-30"
---

# ARCH-02 · Relocate the shared page-coordinate transform into editor/geometry

## Scope and acceptance

**Relocate the shared page-coordinate transform into `editor/geometry`.** Once SIGN-05 lands the single forward/inverse transform, move `src/lib/coords.ts` into `src/editor/geometry/`, updating `PdfPageCanvas`, registry serializers, and the gesture controller. Leave per-type resize arithmetic where it already lives (`editor/registry/boxResize.ts`, `centeredResize.ts`) — the design record's "one owner per element type" for resize math is a different, already-correct rule from "one shared viewport/percentage/PDF transform," and `editor/geometry` should hold only the latter. Sequence after SIGN-05, not before, so the moved file carries the corrected transform rather than freezing today's version in a new location.

**Completed 2026-08-30.** The corrected SIGN-05 geometry and tests now live under `src/editor/geometry/`; all production and test callers were rewired.
