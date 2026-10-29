---
id: "ARCH-131"
title: "Sign and Redact's card rules leave the shell stylesheet"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
depends_on: []
---

# ARCH-131 · Sign and Redact's card rules leave the shell stylesheet

*Filed 2026-10-29* after 42923db4 (the phone card frame rule for Sign and Redact) ran 110 of 138 specs.

## Why

- `src/shell/PdfTool.module.css` is imported by every tool, so import reachability (ARCH-32) sends an edit there to every tool's e2e. The phone rule that drops the loaded Sign/Redact card's frame (`.tool-card[data-tool-loaded]:has([data-workspace])`) only ever matches those two editors, yet editing it ran Merge, Split, Compress and the rest.

## Outcome

- A CSS edit that only affects the loaded Sign/Redact card runs only Sign, Redact and what really depends on them. No visual change.

## Acceptance

- [ ] Every rule in `PdfTool.module.css` that only matches the loaded editor card lives in a sheet only Sign and Redact import.
- [ ] Before/after narrowing numbers from `DOCS_ONLY=false node scripts/scope-summary.mjs --base HEAD`, a probe comment in each sheet.
- [ ] `check:fast`, `check:push`, and the tool-layout, tool-toolbars and Sign toolbar-labels specs green on a build.
