---
id: "RED-53"
title: "Redact's box toolbar is one calm row: blur on a single line, Duplicate labelled, a clear gap above the box"
status: "in_progress"
priority: "P2"
epic: "redact"
horizon: "now"
depends_on: []
---

# RED-53 · Redact's box toolbar is one calm row: blur on a single line, Duplicate labelled, a clear gap above the box

*From Shlomi's review of RED-51's toolbar, 2026-10-02, with desktop screenshots of a blur and a blackout
box, and a sketch he approved ("build all of it").* The blur bar reads as a small form: "Blur strength",
"Lighter" and "Stronger" label one slider, the heading doubles the bar's height, and the slider row sits
about 9px below the buttons beside it. Duplicate (two squares) and Every page (stacked sheets) look like
the same icon, and only Every page has a label. The tick on the slider marks the default but says so only
in a hover tooltip. The bar sits so close to the box that the top-centre resize handle is fiddly.

## Acceptance

- The blur bar is one row, the same height as the blackout and whiteout bars, with every control on one
  centre line. The slider's ends are shown by a small and a large blur mark, not words, and its accessible
  name is still "Blur strength". No default tick.
- Duplicate and Every page have clearly different icons. Where there is room (the desktop pill) both carry
  a text label; on the phone bar they are icon-only with aria-labels and titles, and the whiteout bar stays
  one row at 375, 390 and 402px.
- Blackout, blur and whiteout bars share one right side: Duplicate, Every page, divider, Delete.
- The desktop pill leaves a clear gap above the box, so every top handle can be grabbed.
- Every colour comes from the `:root` tokens, chosen by the palette and the UX guideline.
- Unit tests and the redact e2e cover the new structure; the bar is measured in a real browser at
  desktop width and at 375, 390 and 402px.
