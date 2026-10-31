---
id: "SIGN-42"
title: "Sign and Redact: one full-screen button instead of the Relaxed / Condensed / Full screen control"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# SIGN-42 · One full-screen button instead of the three-way view control

*Filed 2026-10-31 from Shlomi: "in sign tool there is a 3 way toggle for full screen, it is too much,
lets turn it to two options like in other tools - either full screen or not".*

Sign and Redact show `ViewControl` at 920px and up: a segmented Relaxed / Condensed / Full screen
control (docs/view-density-control-spec.md). Every other tool with full screen has one button that
toggles it. Relaxed / Condensed is one global preference (`pdf-toolkit:view-density`) whose only
effect is whether the tool hero folds once a file is open, on every tool page, so dropping the control
from Sign alone would leave anyone who once picked Relaxed in Redact with an expanded hero on Sign and
no way back. Both editors change together, and the preference goes.

## Outcome

- Sign and Redact render `FullscreenButton` at every width, in the slot `ViewControl` held.
- The density preference is gone: no `useViewDensity`, no `data-view-density` from the pre-paint
  script, and the hero, stage and card rules that were gated on `condensed` apply unconditionally (the
  default most people already had). The script's hand-computed CSP hash in `astro.config.mjs` is
  recomputed.
- The gate that keyed on the control's `aria-label="View density"` keys on an explicit editor marker.
- Unit tests, e2e specs, messages and the editor rule no longer mention the control; the spec doc is
  marked superseded.

## Done 2026-10-31

Sign's Full screen is icon-only on desktop (44px where the segmented control took 99px); Redact keeps
its word (RED-34). Both desktop rows stay on one line at 1440px and 1100px, the phone grid is the 6+6 it
was, and the hero folds on load at every width. New pre-paint hash `sha256-k9N098sQ...` matches on
/sign/, /redact/ and /merge/; `test:csp` passes on 55 pages. `check:fast` and the full Playwright suite
(product, fonts, export guards, 290s) pass.
