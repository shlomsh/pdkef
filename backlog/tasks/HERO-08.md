---
id: "HERO-08"
title: "Sign and Redact on a phone: a one-line hero once loaded, without moving the field toolbar"
status: "open"
priority: "P2"
epic: "tool-pages"
horizon: "later"
depends_on: []
---

# HERO-08 · Sign and Redact on a phone: a one-line hero once loaded, without moving the field toolbar

*Filed 2026-10-16 from HERO-06.* Every other tool's hero folds to one line once a file is loaded. Doing the
same for Sign and Redact on a phone (a 393 to 440px coarse-pointer viewport) lifted the form field, and
`src/tools/sign/e2e/toolbar-zoom-physical-size.spec.js:292` then saw Sign's full field toolbar jump 149px
sideways at 1.8x pinch zoom (anchor x 389.9 to 240.9), so the fold was left out of HERO-06. Sign's phone
layout is frozen for patches in favour of the next generation ([docs/sign-next-gen.md](../../docs/sign-next-gen.md)),
so this belongs with that work.

Measured alongside it at 393x852 (the Compress session, 2026-10-15): the empty-state sheet's top ranges
from 253px (Merge) to 472px (Sign); Sign's sheet bottom runs to 856; Sign's tile is the dark filled one
while every other tool's is light; Sign's "Turn on airplane mode" line sits above the sheet (below it
everywhere else), and it stays above the card once a file is open.

## Acceptance

- [ ] Sign and Redact on a 375px phone show a one-line hero once loaded, and the toolbar-zoom spec stays green.
- [ ] The airplane line follows the same rule as every other tool, and leaves once a file is open.
- [ ] Sign's empty-state sheet and tile match the other tools at 393x852, or the difference is recorded as intended.
