---
id: "SCAN-60"
title: "Late work leaves removed pages and moved corners alone"
status: "open"
priority: "P3"
epic: "scan-next"
horizon: "later"
depends_on: []
---

# SCAN-60 · Three small late-work gaps

*Opened 2026-11-05* from the read-only review of Scan at `b7fd7e91`. Each comes from reading the code. Start each with a
test seen failing, and drop any that cannot be made to fail.

## Outcome

- `adoptResult` skips a page in `work.removed`, as `inspectPage` does. `work.pages` is only assigned at render, so a
  worker message landing before the next render writes `work.results` and two object URLs for a removed page.
- Find the page does not replace corners the person moved while it waited in the queue.
- A turned preview that fails to draw leaves a way forward. `useScanView` only reports the error, and the corners box stays blank.
