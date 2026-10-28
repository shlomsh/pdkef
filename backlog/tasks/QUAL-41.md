---
id: "QUAL-41"
title: "Every file a spec reads directly is covered by a scope rule"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: ["QUAL-34"]
---

# QUAL-41 · Every file a spec reads directly is covered by a scope rule

*Filed 2026-10-28* from the CI and build-structure assessment of 2026-10-27: a replay of the scope verdict on 58 consecutive pushes to main, job timings from 24 CI runs (2026-10-26/27), and `check:fast`/`check:push` timed on typical diffs. Lane: [ARCH-123](ARCH-123.md).

## Why

- Nx sees imports, not files a spec opens with `readFileSync` or `new URL(...)`. Today these are
  covered by failing open (an unknown file widens), not by a rule: `src/lib/__fixtures__/`,
  `public/images/redaction-guide/`, `public/sw.js`. Once QUAL-34 and QUAL-40 narrow those paths, a
  spec reading one of them could be skipped by mistake.

## Outcome

- A guard scans e2e and unit specs for direct file reads and fails when a target has no widen or
  owner rule that selects that spec.

## Acceptance

- [x] The guard fails on a fixture spec that reads an uncovered file, and passes on the current tree.
- [x] It runs in `check:fast` and CI.

## Done (2026-10-28)

- `scripts/check-spec-file-reads.mjs` (`npm run test:spec-file-reads`) scans unit and e2e specs for reads with
  statically resolvable paths (`readFileSync`, `new URL(.., import.meta.url)`, `join(ROOT, ..)`, `setInputFiles`, ...),
  then asks the real oracles whether a change to each target selects that spec: `selectUnitTests` for units,
  `deriveScope` over the Nx graph (read once) for e2e. Its test fails on a fixture spec that reads an uncovered
  file. A read the spec also imports is dropped, as vitest sees it. Dynamic reads (262 today) are counted, not judged.
- First run on the tree: 29 uncovered pairs. Unit reads got widen rules in `scripts/unit-scope.mjs` (the sample PDF,
  the fixture folders, five CSS/Astro text reads, `middleware.ts`, the RED-18 corpus, the scoring forms). One e2e
  gap was real: `symbol-resize-floor.spec.js` opens a scoring-corpus PDF that no Nx project edge reaches, so
  `unowned-verdicts.mjs` has a row sending it to `src/tools/sign/e2e/` (a project edge first widened every corpus edit
  to everything, so it was replaced). Two guard bugs were fixed: the export and font specs are selected by their flags,
  not by `e2e_paths`, and the guard's own test names files it never reads.
- Live oracle probes (committed first): a corpus PDF gives `e2e_paths=src/tools/sign/e2e/`, fonts off, not wide; a
  corpus test file stays unit-only; `public/sw.js` and an oracle file still give everything.
- Runs in `check:push` and the CI `checks` job every time. `check:fast` runs it only when the diff touches a spec, a
  scope oracle, an Nx project or `nx.json`, because it costs one Nx graph (8 to 10 s).
- Four unit specs read docs files (`.claude/rules/`, `docs/module-boundaries.md`, `docs/error-known-items.json`,
  `docs/language-font-acceptance-matrix.md`). A docs-only push runs no test in CI, so an edit there is untested until
  the next code push. The guard prints them as a notice and does not fail; no scope rule can select them.
