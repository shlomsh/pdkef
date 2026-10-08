---
id: "RED-61"
title: "Redact toolbar at 390: six per row clips Blackout, Whiteout and Download"
status: "in_progress"
priority: "P2"
epic: "redact"
horizon: "now"
depends_on: []
---

# RED-61 · Redact toolbar at 390: six per row clips Blackout, Whiteout and Download

Filed 2026-10-08 from Shlomi's screenshot during the RED-59 review. Already on `main` (measured
against `origin/main` 6fbe1022 and the RED-59 branch: identical numbers).

## Measured (390x844, after a Delete export, eleven controls)

| Button | Button width | Text width | Overhang per side |
| --- | --- | --- | --- |
| Blackout | 44.9 | 46.0 | 1.6px clipped |
| Whiteout | 44.9 | 48.1 | 2.6px clipped |
| Download | 44.9 | 52.2 | 4.6px clipped |

Layout at 390 is 6+5; at 375 and 360 it is 4+4+3 with at least 3px spare per side. The eleven-control
rule (`src/editor-ui/SignToolbar.module.css`, `--controls-per-row: 6` under the 531px container query)
holds six per row down to the 44px touch floor, where a 390 phone's toolbar gives each control 44.9px.
`src/tools/redact/RedactToolbar.module.css`'s 480px rule (0.66rem, 2px padding) assumed "about 52px"
per control, which 390 does not give. Script and shots: scratchpad `toolbar-clip/`.

## Fix

Eleven controls step down from six per row to four (4+4+3, the balanced count editor.md names) where
six no longer give the widest label its width: the threshold is the toolbar content width at which six
of `widest label + padding + border + 2px air` plus five gaps fit. Sign (twelve) is unchanged. Guard:
an e2e that, after an export, walks every toolbar button at 360, 375, 390, 414 and 430 and asserts the
label's `Range` extent sits inside the button's border box on both sides (per `.claude/rules/tests.md`:
a property, not a pixel count), red at 390 first.
