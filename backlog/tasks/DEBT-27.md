---
id: "DEBT-27"
title: "Error reports carry the call chain and the page's situation, not just one frame"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
order: 1
depends_on: ["DEBT-17"]
---

# DEBT-27 · Error reports carry the call chain and the page's situation, not just one frame

*Filed 2026-10-01.* DEBT-17 shipped reports of `{area, name, frame}`. Enough to count a defect, thin
for troubleshooting one: a single frame is where it threw, not how it got there, and nothing says
what the page was doing. Shlomi's call: the reports exist to troubleshoot, so carry a stack and
context, under the same rule - nothing from a document, no free text, every field a position in our
own code, a closed list, a bucket or a flag.

## Decision (2026-10-01)

- **stack**: every frame inside `/_astro/`, top first, at most 8, each `chunk.hash.js:line:col`.
  The top one stays the fingerprint the counts are keyed on.
- **step**: a label written at the call site (`thumbnail`, `export`, `load`...), an identifier.
- **tool**: the page's path (`/sign/`, `/he/sign/`), path only.
- **online**, **installed** (display-mode standalone), **sw** (a service worker controls the page),
  **age** (how long the page had been open, bucketed).
- **Still no message**: mapped through the source map, the column lands on the expression the
  message would have named, and the message is the one field that has ever leaked.
- **Storage**: counts unchanged, plus the latest full example per fingerprint per day, 90 days.
  `errors:read` shows it under each count; `errors:resolve` maps every frame of it.

## Acceptance

- [ ] Schema, browser reporter and endpoint carry the fields above and nothing else, adversarially
      tested as DEBT-17's were.
- [ ] Every one of DEBT-17's 46 call sites passes a step.
- [ ] `errors:read` shows a sample per fingerprint; `errors:resolve` maps a whole stack.
- [ ] The endpoint stays silent on every failure (DEBT-17's test, kept green).
- [ ] Disclosure updated wherever DEBT-17 disclosed, and still literally true.
- [ ] Sabotage-checked in a production build and against the real store; reviewed fresh.
