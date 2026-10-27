---
id: "ARCH-72"
title: "Uncaught-error reporting installs from the layout, and every island has an error boundary"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
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

- [x] A unit test shows a thrown render error reaches the reporter; one install per page.

## Done (2026-10-27)

src/lib/IslandErrorBoundary.tsx wraps every island at its export (the ten tool islands, BasePdfTool, FileDropzone, ScrollDriver), installs the window handlers once per page and reports a render error once before re-throwing it, so the screen is unchanged. Installed from the boundary, not a layout script, so the static SEO surface ships no JS. Unit tests cover the report, one install, nesting and the window handler skip.
