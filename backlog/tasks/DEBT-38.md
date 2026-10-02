---
id: "DEBT-38"
title: "A browser too old for pdf.js is told so once it adds a file"
status: "done"
priority: "P3"
epic: "robustness"
depends_on: []
---

# DEBT-38 · An old browser is told it is too old

*Filed 2026-10-02.* Production reported `ReferenceError` from Chromium 109 on Compress (build d7256d8).
pdfjs-dist 6.3.289 reads the global `Iterator` at `pdf.mjs:797`, which Chromium only has from 122, so
every tool that opens a PDF fails there with no explanation.

## What to build

`src/lib/browserSupport.ts` judges the user agent against floors (Chrome and Edge 122, Firefox 131,
Safari and iOS 18.4; iOS is judged by the OS version since every iOS browser is WebKit). An agent it
cannot place is never warned. `BasePdfTool` shows a quiet notice, naming the version, only once a file
is added. The page itself is never blocked.

## Acceptance

- [x] The judgement is pure and unit-tested.
- [x] The notice is absent on the empty page and in a current browser, and present once a file is added.
- [x] The floors match MDN browser-compat-data for the global `Iterator` constructor (Chrome and Edge 122, Firefox 131, Safari and iOS 18.4), checked 2026-10-02.
- [x] The Hebrew text is read by Shlomi ("קבצי", corrected).

## Not checked

The notice does not stop the crash: an old browser that proceeds still throws and still reports, so the
registry lists it as open. Switching to pdfjs-dist's legacy build was weighed and not done (+22% main
bundle for one visitor so far).
