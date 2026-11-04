---
id: "SCAN-31"
title: "The Scan guide's image generator follows the rewritten phone flow"
status: "open"
priority: "P3"
epic: "scan-next"
horizon: "later"
---

# SCAN-31 · The guide's pictures can be made again

*Opened 2026-11-04.* `scripts/generate-scan-examples.mjs` stops at line 233 waiting for a "Top-left corner"
button: it still drives the flow from before SCAN-13, so `public/images/scan-guide/*.jpg` can't be
regenerated.

**Done when:** the script runs on a production build, and the size-limit pictures on `/scan-to-pdf/` come from
the 500,000-byte limit.
