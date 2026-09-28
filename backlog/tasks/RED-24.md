---
id: "RED-24"
title: "A new blur box starts at medium strength, not strong; a chosen light blur is trusted"
status: "open"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-24 · A new blur box starts at medium strength, not strong; a chosen light blur is trusted

*Shlomi, 2026-09-28: light blur should not be the default; medium is. A person who picks light
proactively knows what they're doing, so nothing warns them or suggests Blackout.*

Today a new blur box starts at `DEFAULT_BLUR_STRENGTH` (`strong`, `src/editor/model/blurStrength.ts`),
then at the person's last choice (`lastBlurStrength` in `preferenceStore.ts`). That one constant also
decides what a box saved before strength existed restores as, and those boxes were drawn strong.

- Split it: a new-box default of `medium`, and a legacy-restore value that stays `strong`, so no saved
  draft changes how it looks.
- The remembered last choice still wins over the default, light included.

## Acceptance

- With no remembered choice, a new blur box is medium.
- A draft box saved without a strength still restores as strong.
- After picking light, the next new box is light, with no warning anywhere, including RED-17's check.
