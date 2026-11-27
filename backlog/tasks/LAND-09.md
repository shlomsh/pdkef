---
id: "LAND-09"
title: "A test's time budget measures the test, not a cold start"
status: "open"
priority: "P3"
epic: "honest-tests"
horizon: "next"
depends_on: ["LAND-06"]
---

# LAND-09 · A test's time budget measures the test, not a cold start

*Filed 2026-11-27.* Two rules report work inside a test body that the 5 s budget then measures
(docs/landmines-adoption.md): `no-cold-import-in-test`, 52 dynamic `import()` calls in 27 files
(`PdfSignTool.test.tsx:905`, `acceptNegotiation.test.js:145`), and `no-cold-start-in-test`, 113 process or
runtime starts in 21 files (`dependencyDirections.test.js:19`, `generate-precache-manifest.test.mjs:101`,
`check-ratchet-raises.test.mjs:38`). On battery or under a busy CI runner a cold start is where a test runs
out of time with no bug (reference: tests slow on battery).

## Outcome

- First, a sample of 20 `no-cold-start-in-test` hits says how many are real spawns and how many are cheap
  helpers the rule over-reports; a real miss or false positive goes upstream, like PR 21 and PR 33.
- Imports hoist to the top of the file or a `beforeAll`; a fixture that must start fresh per test keeps a
  one-line disable naming why.
- Both rules at `error` in `.oxlintrc.json`, `npm run lint:landmines` clean.
