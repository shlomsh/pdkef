---
id: "ARCH-72"
title: "Uncaught-error reporting installs from the layout, and every island has an error boundary"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 12
depends_on: []
---

# ARCH-72 · Uncaught-error reporting installs from the layout, and every island has an error boundary

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Safety nets. Criterion: Error handling and async. Structure only: no behaviour change.

## Why

- `installUncaughtErrorReporting()` is called only from `src/shell/BasePdfTool.tsx:175`, so uncaught errors on the home page and static surface are not reported (inferred from the call sites).
- No Preact error boundary or `options.catchError` exists.

## Outcome

- The handlers install from a layout-level module once per page; each island renders inside one shared boundary that reports.

## Acceptance

- [ ] A unit test shows a thrown render error reaches the reporter; one install per page.
