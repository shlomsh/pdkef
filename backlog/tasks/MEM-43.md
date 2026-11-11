---
id: "MEM-43"
title: "A tool works in airplane mode on its first visit"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-43 · A tool works in airplane mode on its first visit

*Filed 2026-11-12*, the owner's decision after measuring MEM-39 on the live site.

## Why

Every tool page says "Turn on airplane mode and give it a try. It still works." Since MEM-39 the worker
registers only after a file is opened, and the PDF engine is fetched only when a file is opened. Measured
live: a first-time visitor to Redact, Sign, Merge or Compress who goes offline and then picks a file gets
"This PDF didn't open. It may be damaged, or locked with a password". The line was false for exactly the
person it invites. The owner chose to load everything a tool needs on the tool page, even when no file was
opened, and accepts the request cost (about +26 CDN requests on a first visit to Redact).

## What

- A page that shows a tool carries `data-tool-page` (the `ToolStage.astro` wrapper). `whenEngaged` in
  `src/lib/appUpdate/engagement.ts` resolves on that marker (`toolPage`, injected like the other inputs), so
  the worker registers during the first visit and installs the open page's closure (MEM-40 stays: no home page).
- Home, articles, `/drive/`, `/open/` and the install page keep their rule. `markFileOpened` and
  `pdkef:file-opened` stay.
- The request guard reads the marker from the built HTML: a tool page's first visit includes the install,
  and opening a file adds nothing.
- E2E proves the claim: fresh context, no file, install complete, offline, then a file opens, per tool.
- Copy MEM-39 narrowed is restored to the original wording (install page, its Hebrew twin, the card blurb).

## Done when

- [ ] Each tool page registers the worker on a first visit with no file; `/` and articles do not.
- [ ] Offline after that install, picking a file reaches the tool's loaded state with no error, for every PDF tool.
- [ ] Request guard: tool pages' first-visit budgets are the measured values including the install, after-open 0.
- [ ] Copy restored; `docs/request-budget.md` D2 and D6 and the PWA rule match.
- [ ] Measured live: a fresh visit to a tool, offline, open a file, it works; and the request numbers.
