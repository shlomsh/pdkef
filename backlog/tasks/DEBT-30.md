---
id: "DEBT-30"
title: "Merge destroys its Sortable twice and throws, caught in production by the error loop"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: ["DEBT-27"]
---

# DEBT-30 · Merge destroys its Sortable twice and throws, caught in production by the error loop

*Filed 2026-10-01.* The first defect DEBT-27's loop caught from a real visitor.

## The report

`npm run errors:read -- --days 7`:

```
1 | uncaught | TypeError | sortable.esm.BqtE8hmV.js:1:29107 | window_error | firefox-153
    window_error · /he/merge/ · browser/sw · under_10m
```

`npm run errors:resolve` on its four frames (one command, the matching build found on the first try):

- `sortablejs/modular/sortable.esm.js:2151` `el[expando] = null;` (in `destroy()`)
- `src/tools/merge/PdfMergeTool.tsx:489` `sortableRef.current?.destroy();`
- two Preact hook frames (the effect running).

## Cause

The rail's Sortable effect returns `() => sortableRef.current?.destroy()` and never clears the ref.
Sortable's `destroy()` ends with `this.el = el = null`, so when the effect runs again (its deps
`[entries.length > 0, applyFileReorder]` change: files added, Clear all, files added again) its
defensive `sortableRef.current?.destroy()` destroys the same instance a second time and throws on
`el[expando]`. The phone chip row's effect has the identical pattern. Thrown inside a Preact effect,
it can take the Merge island down, not just log.

## Acceptance

- [ ] A test drives the sequence that re-runs the effect after its cleanup and fails on the old code
      for this reason.
- [ ] Both cleanups clear their ref; the test passes.
- [ ] `errors:resolve` clips minified dependency lines (this report printed whole minified files).
- [ ] After the push, no new `sortable.esm` destroy report arrives from the fixed build.
