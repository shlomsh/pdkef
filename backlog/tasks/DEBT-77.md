---
id: "DEBT-77"
title: "Tests that run real pdf.js in Node share one worker setup"
status: "done"
priority: "P3"
epic: "honest-tests"
depends_on: []
---

# DEBT-77 · Tests that run real pdf.js in Node share one worker setup

*Filed 2026-11-20, from LAND-04 wave 1.* Every test that opens a real PDF with pdf.js's legacy (Node) build
points `GlobalWorkerOptions.workerSrc` at the legacy worker file with its own copy of the same
`Object.defineProperty` line. 18 files carry it, including `src/test/support/redactCheckPdfs.test-helper.ts`.
The helper's copy builds the URL from `import.meta.url`, which jsdom files resolve to http, so jsdom tests
repeat it with a `process.cwd()` file URL instead.

## Outcome

- One test-support module sets the worker once, with a URL that resolves in both the Node and jsdom
  environments, and every one of the 18 files imports it instead of its own copy.
- No test changes what it asserts; the same files pass before and after.
