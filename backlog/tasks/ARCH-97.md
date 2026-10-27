---
id: "ARCH-97"
title: "Structural drift from the audit is cleaned up and guarded"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
order: 2
depends_on: []
---

# ARCH-97 · Structural drift from the audit is cleaned up and guarded

*Filed 2026-10-27* from the drift lists of the structural audit (ARCH-42..95).

## Why

- Edit Pages names two page-tool messages differently from Split and PDF to Image (`invert`/`editedReady` vs `invertPages`/`readyAnnouncement`).
- docs/module-boundaries.md and the script disagree on test-support -> tool and on rule 10's wording.
- Redact's hand-off button unions and the editor's `'sign' | 'redact'` are hand-written beside `HandoffTargetId`.
- Nothing checks that a new island renders inside the shared error boundary (an unwrapped island landed the same day).
- The open known error SIGN-40 matches step `unhandled_rejection`; the island boundary now reports render errors as `island_render`, so the daily read would show it as new.
- Spike scripts import editor modules that moved.

## Outcome

- One message key per meaning, derived unions, the doc and script in step, a guard for island wrapping, known errors that match the new step, spikes that resolve.

## Acceptance

- [ ] A planted unwrapped island fails the new check.
- [ ] SIGN-40 matches an `island_render` report.
- [ ] check:push green.
