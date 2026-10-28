---
id: "QUAL-34"
title: "Each file outside an Nx project gets its own scope, not \"everything\""
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# QUAL-34 · Each file outside an Nx project gets its own scope, not "everything"

*Filed 2026-10-28* from the CI and build-structure assessment of 2026-10-27: a replay of the scope verdict on 58 consecutive pushes to main, job timings from 24 CI runs (2026-10-26/27), and `check:fast`/`check:push` timed on typical diffs. Lane: [ARCH-123](ARCH-123.md).

## Why

- A changed file no Nx project owns makes `wide()` (`scripts/affected-scope.mjs:278`) return
  everything, with font guards and export guards on (the unowned check is at `:375`). There are 152
  such tracked files.
- In the replay of 58 pushes: 14 docs-only (24%), 30 everything (52%), 12 narrowed, 1 nothing. 24 of
  the 30 wide pushes also ran the 25 font guards. Reasons, overlapping: `ci.yml` 10, `package.json` 8,
  `public/sw.js` 5, `public/images/**` 5, `vercel.json` 4, core content or layout 6.
- Several of these need no e2e at all:
  - `middleware.ts`: `astro preview` runs no middleware (`e2e/error-report-build.spec.js:7`), and its
    logic is unit-tested.
  - `spikes/**` (81 files), `prototypes/`, `.gitignore`, `security/*.json`, `.github/dependabot.yml`,
    the issue templates, `public/llms.txt`, `public/agents.md`, `public/manifest.webmanifest`.
- Others need a narrower run, not everything: `public/sw.js` (e2e/offline reads it, chromium without
  fonts), `vercel.json`, `api/report.ts`, `public/images/**`, and `ci.yml` (fonts only when the
  font-guards job itself changed).
- Rightly wide: `package.json`, the lockfile, `patches/`, `astro.config.mjs`, `playwright.config.js`,
  `nx.json`, `tsconfig.json`, `vitest.config.js`.

## Outcome

- `publicOwnerOf` (`scripts/affected-scope.mjs:220`) grows into a small table of per-file verdicts
  (no e2e; chromium without fonts or webkit; specific specs), and only the files that really can reach
  everything still widen. Unknown files keep failing open.

## Design (2026-10-28)

A table of verdicts for files no Nx project owns, checked after the existing unowned rule:

| Files | Verdict | Evidence |
| --- | --- | --- |
| `middleware.ts`, `vercel.json`, `api/**` | no e2e | `astro preview` runs no middleware, reads no `vercel.json` and serves no `api/`; specs only watch `/api/report` requests; their checks are unit tests and `test:csp`/`test:redirects` |
| `spikes/**`, `prototypes/**`, `.gitignore`, `security/**`, `.github/dependabot.yml`, `.github/ISSUE_TEMPLATE/**`, `public/llms.txt`, `public/agents.md` | no e2e | no spec or build step reads them |
| `public/manifest.webmanifest` | `e2e/offline/` | precached and served like every public file; only the `e2e/offline/` update specs exercise that |
| `public/sw.js`, `public/images/**` | every product spec, no font guards | every page registers the worker; tool specs open `public/images/**`; no font guard reads either |
| `.github/workflows/ci.yml` | every product spec; font guards only when the diff touches the `font-guards` job or anything outside a job, or that job is missing | |

- Table files are left out of the `nx show projects --affected` query: Nx marks most projects affected by
  `middleware.ts` and `vercel.json`, which would otherwise widen through the core rule.
- A file in neither Nx nor the table still widens with fonts on, as today.

## Acceptance

- [x] One `scripts/affected-scope.test.mjs` row per entry in the table, plus one proving an unknown
      file still widens.
- [x] Replaying the same 58 pushes shows fewer wide verdicts, and the ticket records the new numbers.

## Replay (2026-10-28)

The same 58 pushes (57 runs in `pairs.txt` plus the assessment's docs-only count), through
`resolveScope` at 4b844a62 and then on this branch:

| Verdict | Before | After |
| --- | --- | --- |
| Docs-only | 14 | 14 |
| Everything | 31 | 29 |
| Everything with the 25 font guards | 25 | 17 |
| Narrowed | 12 | 12 |
| No e2e | 1 | 3 |

- 8 wide pushes stop running the font guards: `ci.yml` edits outside the font-guards job, `public/sw.js`
  and `public/images/**`.
- 2 pushes that changed `vercel.json` and docs run no e2e; the build and dist guards still check it.
- What still widens: `package.json` or the lockfile (9), a core project the import walk cannot narrow
  (7), the build pipeline (3), `ci.yml` (2), the CI oracle (2), `playwright.config.js`, `nx.json` and
  `vitest.config.js`, `.github/workflows/dependency-advisories.yml`.
