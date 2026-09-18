---
id: "SIGN-29"
title: "Desktop toolbar wraps Download onto a full-width second row since the Date tool"
status: "done"
priority: "P2"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-09-18"
---

# SIGN-29 · Desktop toolbar wraps Download onto a full-width second row since the Date tool

Shlomi, 2026-09-18, on the live /sign/ at a normal laptop width: "what is the deal with the huge new
download button on the sign tool, it takes an entire row on desktop".

It is not a new button. `SignToolbar.module.css`'s desktop block (≥920px) makes wrapping the
fallback when the labelled row does not fit: `flex-wrap: wrap`, `flex-shrink: 0` on every control,
and container queries that drop the low-priority labels (Undo, Full screen, Replace at ≤1160px, the
tool labels at ≤960px) so the row shrinks *before* it has to wrap. Every control is `flex: 1 1 auto`,
so whatever lands alone on a second line grows to fill it. The thresholds were computed from "Sign's
ten labelled controls come to ~1100px". The Date tool (79c2238c, 2026-09-15) added a labelled control
and redid the phone arithmetic only; Share on desktop Chrome adds another. The row is now ~1300px
labelled, so at a toolbar between ~1160px and that figure no label has dropped yet, the row overflows,
and Download becomes a banner. The comment predicted exactly this drift.

## Scope

- Measure the real labelled row widths in a browser (Sign and Redact, with and without Share) at the
  current control set. Record the figures in the CSS comment; the ~1100/~910/~620 numbers are stale.
- Move the label-drop thresholds so every label collapses before the row can overflow, adding a tier
  if two are no longer enough. Priorities stay as documented (Undo/Full screen/Replace first, the
  tool vocabulary last, Download/Share never).
- An e2e guard: at a few desktop container widths across 920px and up, the toolbar renders as one
  line (every control's top equals the first control's top) for both tools. jsdom cannot see rects.

## Acceptance

- No desktop width from 920px up wraps the Sign or Redact toolbar with the current control set.
- The label-priority thresholds in `SignToolbar.module.css` are measured, not inherited, and the
  comment says where each figure came from.
- `check:fast` and the full `ci.yml` chain green.
