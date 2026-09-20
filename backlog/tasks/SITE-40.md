---
id: "SITE-40"
title: "Redact's toolbar packs 4+4+2 once 'Compress it' appears"
status: "open"
priority: "P3"
epic: "site-quality"
phase: "longer-term"
depends_on: []
---

# SITE-40 · Redact's toolbar packs 4+4+2 once "Compress it" appears

*Found 2026-09-20 while re-measuring the toolbar for UNDO-06, in headless Chromium on Linux.*

Redact counts nine controls, which wrap 5+4 and then 3+3+3 - even the whole way down. But after a
redacted export exists, the hand-off to Compress appears as a tenth control, and **ten is the one
count `SignToolbar.module.css` documents as unbalanceable at the 44px floor**: greedy flex fills
each line to the cap, so ten lands 4+4+2 at a cap of four and 3+3+3+1 at a cap of three. Measured:
one line to 608px, 5+5 down to 336px, then 4+4+2 from 335px down.

4+4+2 is the shape the file already tolerates for ten - a full short row rather than a stranded
single control - so this is a blemish, not a bug, and no `--controls-per-row` value improves it.
Redact was at eleven before UNDO-06 and balanced 4+4+3; removing History is what exposed it.

**No guard covers it**, because the toolbar layout specs never run an export, so nothing will catch
it changing shape either.

## What fixing it would take

Not a CSS threshold. It needs a Redact-side decision about the tenth control:

- give "Compress it" a `[data-optional-control]` so it stands down on the narrowest phones (it is a
  hand-off to another tool, not an editing control, and it is reachable from the Compress page), or
- move the hand-off out of the toolbar entirely, next to the export actions below the document,
  which is where the other post-export affordances already live.

The second is probably right on its own merits, independent of packing. Either way the fix should
come with a toolbar spec that exports first, so the ten-control state stops being unmeasured.
