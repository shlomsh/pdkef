---
id: "MEM-18"
title: "CI budgets each page's precache closure and keeps tool-specific assets out of other tools' closures"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: ["MEM-15"]
---

# MEM-18 · CI budgets each page's precache closure and keeps tool-specific assets out of other tools' closures

*Filed 2026-10-27* from a loading measurement of origin/main.

## Why

- `scripts/check-page-weight.js` budgets first paint (`MAX_FIRST_LOAD_BROTLI = 400_000` per page) and
  eager images. `scripts/check-lazy-modules.js` keeps named engines out of first paint. Neither looks at
  what the service worker downloads, at wasm, or at fonts.
- That gap is how the precache reached 5.2 MB on the wire unnoticed: a tool's assets (Scan's guide
  photos, Sign's export chunk) reach every visitor of every other tool.

## Outcome

- A check reads the per-page closures from MEM-15's manifest and sums each one's brotli size from
  `dist/`. It fails when a page's closure exceeds its budget, and when an asset that belongs to one tool's
  folder appears in another tool's closure.
- Budgets are budgets, not ratchets (CLAUDE.md): set from the heaviest measured tool plus stated headroom,
  in one place beside the page-weight budget.
- It runs in CI after `build`, with the other weight checks.

## Acceptance

- [ ] Adding a large asset to one tool's closure fails the check with the page, the asset and the bytes.
- [ ] Importing a Scan-only module from Redact fails the cross-tool rule, naming both tools.
- [ ] The budget numbers and the measured closures they came from are written in the Done section.

## Done (2026-10-27)

- `scripts/check-precache-budget.mjs` (`npm run test:precache-budget`, CI after `test:lazy-modules`)
  sums brotli bytes from `dist/` for the shell, each page's closure and the whole install (shell plus
  every page, what the worker downloads since MEM-15's scope change). It fails over budget with the page
  and its bytes; when a closure carries another page's island chunk, naming both pages and the asset;
  when a closure lists a file missing from `dist/`; when `dist/_astro/` holds a file kind the closure
  walker does not handle; when a script, style or wasm file in `dist/_astro/` is in no list of the
  install (`KNOWN_ORPHANS` names the one inlined stylesheet); and when a tool page's closure lacks its own
  island. The closure walker throws if a chunk names `__vite__mapDeps` but no preload list matched, so
  a minifier rename breaks the build instead of dropping files. `--table` prints every closure and the install. Unit tests on fixtures.
- Budgets (brotli bytes, in `BUDGETS`, each with its measurement beside it): shell 460,000 (measured
  360,580); tool pages 1,700,000 (/sign/ 1,453,772, /redact/ 978,780); home pages 180,000 (/ 151,553,
  it carries the Redact sample PDF); other pages 42,000 (heaviest article /open/ 35,329).
- The install budget, 5,000,000 (measured 3,203,299 over 183 URLs), is not headroom: it is the line from
  MEM-15's decision. Over it, the failure says to revisit per-tool caching rather than raise the budget.
