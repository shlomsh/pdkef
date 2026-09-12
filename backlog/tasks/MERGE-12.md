---
id: "MERGE-12"
title: "One tap: pre-merge on idle so Download is instant, with progress that tells the truth"
status: "open"
priority: "P1"
epic: "merge-tool"
phase: "near-term"
depends_on: ["MERGE-09", "MERGE-11"]
legacy_state: "Open"
---

# MERGE-12 · One tap: pre-merge on idle so Download is instant, with progress that tells the truth

*Filed 2026-09-13* from the Merge review.

## Scope and acceptance

Upload-based tools need a Merge step because the work happens elsewhere. Ours does not: pdf-lib copies
pages in tens of milliseconds for typical sets. So the explicit step goes. After the last change to the
list or the pages, wait 600 ms of idle, then build the merged blob in the background with the page
map from MERGE-09; any further change cancels and restarts it. The single primary control reads
`Download merged PDF · 18 pages · 2.1 MB` as soon as the blob exists and delivers it on the tap.

If the tap arrives while a pre-merge is still running (large sets, slow phones), the button shows the
existing `ProgressRing` inline and delivers when done; the person never sees a separate Merge button.
Progress is per file ("12 of 40 files") and `mergePdfs` yields between files so the strip stays
responsive. A set the device cannot hold ends in a plain sentence about device memory, the caveat
SEO-10 kept, not a crash.

**Analytics.** The lifecycle events in `ANALYTICS.md` keep their meaning: `tool_operation_started`
fires when a pre-merge begins after a change that will be downloaded, `tool_result_ready` when the
blob exists. Document the change in `ANALYTICS.md` so the funnel read in MERGE-16 compares like with
like. Nothing about the files is sent.

**Open question for Shlomi, recorded here:** keep an explicit Merge step behind a setting for the
first month as a fallback, or remove it outright? The plan recommends removing it.

**Acceptance.**

- From last change to Download-ready under 500 ms for a 20-file, 200-page fixture set on desktop,
  measured in the Playwright guard; cancellation verified by changing the order mid-merge and
  asserting the delivered blob matches the final order.
- No disabled or dead button in any state; Share remains where supported.
- `ANALYTICS.md` updated; `npm run build && npm run preview` checked for CSP.
