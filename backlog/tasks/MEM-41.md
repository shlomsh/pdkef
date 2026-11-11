---
id: "MEM-41"
title: "The bundling and stub guards cannot pass on a half-working build"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
depends_on: []
---

# MEM-41 · The bundling and stub guards cannot pass on a half-working build

*Filed 2026-11-11*, from the zero-context review of the MEM-37 stack before it landed. None of these is a
defect in what shipped; each is a way a later change could slip past a guard.

## What

- **The stub step checks each kind of stub.** `scripts/dropStubRequests.mjs` fails when nothing was removed,
  so a build where only the island stubs stopped matching (Astro changes their shape) stays green with one
  more request per tool page. After the rewrite, fail on any `component-url` file `isReexportStub` still
  matches, and require removed script stubs and removed island stubs each above zero.
- **The stub e2e watches island stubs too.** `e2e/stub-requests.spec.js` only matches
  `*_astro_type_script_*` names. Assert that no `/site/*.js` is requested except the files that hold real
  code (`client.js`, `DriveOpen.js`, `PinnedNotes.js`).
- **Kept stubs are named, not inferred.** `isKeptStub` in `scripts/check-precache-budget.mjs` excuses any
  one-line import or re-export file from the orphan check, so a dead stub passes for good. Have the stub
  step write the list of files it kept and excuse only those.
- **The home-bundle guard proves it looked.** `HOME_ONLY` in `scripts/check-lazy-modules.js` passes on
  nothing if the `home` group is renamed, and covers `/` and `/he/` only. Assert `home.js` exists and loads
  on `/`, and derive the home pages from the build.
- **Loaded-state CSS for every tool.** `e2e/module-class-rules.spec.js` opens a file in six tools. Add Scan,
  Unlock/Protect, Image to PDF, PDF to Image, Edit Pages and Compress Image, since
  `scripts/check-stable-names.mjs` no longer flags a module whose whole sheet is missing when its classes
  are drawn only after hydration.
- **The takeover page's retry has an end.** `lastTakeoverAt` in `public/sw.js` is in memory, so a worker
  restarted between reloads hands out the takeover page again; if the new build never activates, the tab
  reloads every 2 s with no exit. Bound it (a count in the URL fragment or sessionStorage of the takeover
  page is not available under its CSP, so decide where the bound lives first).
- **Export names across builds.** Islands now name the chunk's minified export (`component-export="t"`). A
  page from one build beside a chunk from the next breaks if that alias changed. Measure whether the alias
  is stable across builds; if not, give the tool chunks a stable named export.

## Done when

Each bullet has a test that fails on the half-working case it describes, and the guard or code that makes it
pass.
