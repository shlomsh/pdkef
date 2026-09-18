---
id: "QUAL-08"
title: "Measure ARCH-20 on a week of real commits: how often does CI actually narrow, and by how much"
status: "done"
priority: "P2"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-20"]
---

# QUAL-08 · The narrowing rate, measured on post-move commits

*Filed 2026-09-14; split from ARCH-20's production-measurement acceptance item.* ARCH-20's Nx
implementation is complete. This ticket owns only the post-landing evidence and the decisions that
depend on it (ARCH-21, QUAL-07 and DEBT-07).

## Problem

`scripts/nx-affected-histogram.mjs` on the last 200 commits says 47 docs-only, 10 narrow, 143
everything, but ~90% of that window predates the `src/tools/` layout, so a pre-move commit's paths
are unowned by today's projects and classify as `everything` for the wrong reason. The honest
expectation from the file-level ideal (ARCH-15: 34 single-tool and 34 site-only of 200) is that
roughly one commit in six narrows to a tool and one in six is page-only, which ARCH-20 still runs in
full. Whether that holds on real, post-move history is unknown.

## Scope

- After a week (or 40 non-docs commits on `main`, whichever comes first), for every CI run since
  `9b4f944`: read each job's "Affected scope" step summary (or the `affected-scope:` line in the
  log), and record: verdict (`everything` with its reason, or `narrowed to <projects>`), the
  `e2e` shards' test counts and step times, `checks`'s unit test time, whether `font-guards` ran,
  and the run's wall (`gh run view --json jobs,createdAt,updatedAt`). A small script under
  `scripts/` that prints this table from `gh run list` is fine and may stay.
- Report: share of runs in each bucket; median wall per bucket; the reasons behind `everything`
  (unowned config file, which core project, page-only). Compare with the pre-ARCH-20 medians in
  QUAL-05's notes (173s without fonts, 246s before sharding).
- Re-run `scripts/nx-affected-histogram.mjs --count 40` on the same window as a cross-check that the
  oracle and the runs agree.

## Acceptance

- The table and shares are recorded here, with a short result linked from ARCH-20's Notes.
- A recommendation, with the numbers behind it, on whether ARCH-21 (split `site`) is worth doing:
  if page-only commits are under one in ten, it is not.
- A recommendation on DEBT-07, using the same narrowing-rate data: whether finishing the
  `SignMessages` edge (below) and flipping `editor` out of `CORE_PROJECTS` is worth doing, and
  whether Nx itself is worth its footprint (227 of 851 lock packages) given how often narrowing
  actually pays off.

## DEBT-07 input (2026-09-17)

Cutting the two edges DEBT-04's addendum named split into one real fix and one non-fix:

- `signLanguagePage.test.js`'s edge to `editor` is gone (nested as its own `seo-content-guards`
  project, the same shape as `cross-tool-tests`): `lib` and `site-test` both dropped out of
  `editor`'s affected set.
- `src/i18n/`'s edge to `editor` (the `SignMessages` type, re-exported by `toolMessages.ts`) did
  not narrow anything by giving `src/i18n/` its own Nx project. `i18n` is a hub every tool and the
  site itself legitimately import (module-boundaries rule 1), so `editor -> i18n -> {every tool,
  site}` still marks everything affected on any editor change - the same reach the old `site`
  fallback had, just now a named, real edge instead of an attribution artifact. The actual fix is
  to reverse it: define `SignMessages` in `src/i18n/` and have `editor/registry/messages.ts` import
  it from there. `editor -> site-i18n` is already an allowed direction (DEBT-10's carve-out), so
  this is a real cut, not another relabeling - just not attempted yet, pending this ticket's
  recommendation on whether the narrowing is worth finishing at all.

See `backlog/tasks/DEBT-07.md`'s "## Investigated (2026-09-17)" section for the full measurement.

## Current state

The sampling gate is no longer a reason to wait. As of 2026-09-15, `9b4f944..HEAD` contains 76
commits, 59 of them non-docs under `scripts/change-scope.mjs`'s production classification. That is
past the ticket's 40-non-doc-commit threshold. What remains is to collect the per-run Actions data,
summarize the buckets and timings, cross-check the same window locally, and make the ARCH-21
recommendation.

## Result (2026-09-18)

**Method.** `scripts/ci-narrowing-report.mjs` (new, not wired into CI - see its own header) reads
`gh run list` for every completed `ci.yml` run on `main` created on or after `9b4f944`
(2026-09-14T01:31), then per run: fetches the unsharded `checks` job's log and greps the
`affected-scope: <reason>` line affected-scope.mjs writes to stderr (checks, both `e2e` shards and
both `font-guards` shards each resolve the same diff independently right after their own `npm ci`,
so one log per run is enough); reads step-level start/complete timestamps already present in
`gh run view --json jobs` for the `checks` job's "Run tests" step and each `e2e` shard's Playwright
step (no extra call); greps each `e2e` shard's own log for Playwright's own `N passed` summary line;
and checks whether `font-guards`' "Run Playwright e2e tests (font guards...)" step is `skipped`
(its job always runs - only that step is gated on `fonts != 'false'`, see `ci.yml`). Every `gh api`
response is cached under `.ci-narrowing-cache/` (gitignored) so a re-run or a widened window is free
for what it already has.

**Window.** `9b4f944..HEAD` held 156 commits and 60 CI runs by 2026-09-18 (55 `push`, 5 `schedule`);
the table below is the 55 `push` runs, since a nightly `schedule` run answers a different question
(`nightly_unchanged`, not per-commit narrowing).

| verdict | n | share | median wall | median `checks` unit-test step |
| --- | --- | --- | --- | --- |
| `docs_only` (checks/build/e2e/font-guards all skipped) | 10 | 18% | 12s | n/a |
| `narrow`, a tool project | 12 | 22% | 161s | 22s |
| `narrow`, site/fonts only (page-only) | 1 | 2% | 120s | 6s |
| `everything` | 32 | 58% | 178s | 61s |

`everything`'s 32 break down: 12 (22% of all runs) `core project(s) affected` (site, editor, shell,
sometimes lib - a real cross-cutting change, or the `editor -> i18n -> {every tool, site}` reach the
DEBT-07 input above names); 14 (25%) `unowned files` under `scripts/` (test infra, fixtures, guard
scripts - the "root-project trap" `docs/nx-affected-ci.md` already names, not a real full-repo
change); 3 (5%) touched `.github/workflows/ci.yml` itself (correctly conservative); 2 (4%)
`package.json`/`package-lock.json`; 1 (2%) other root config.

Of the 12 narrow-to-tool runs: `tool-sign`/`tool-redact` (8 runs, mostly together - the editor's two
tools share `cross-tool-tests`), `tool-merge` (4). font-guards' Playwright step actually ran (i.e.
`fonts=true`) on 30/55 runs (55%); when it did not, median wall was 132s against 170s when it did -
a larger wall-clock delta (~38s) than narrowing to one tool bought (178s -> 161s, ~17s), because the
workflow's wall-clock is bounded by the slowest parallel job (font-guards was ARCH-20's own stated
long pole, 144-251s), not by summed test count - narrowing cuts the `checks` unit-test step by
roughly 3x (61s -> 22s) but that step is rarely the critical path once Playwright jobs are running
alongside it.

Overall median wall across all 55 runs: 167s, against QUAL-05's pre-ARCH-20 baseline of 173s without
fonts / 246s before sharding - a real but modest improvement, and one that comes more from
`font-guards` narrowing off (45% of runs) and the two-shard split than from tool-level `checks`/`e2e`
narrowing.

**Cross-check.** `node scripts/nx-affected-histogram.mjs --count 156` (the full window, not just the
40 the Scope asked for) against the same range: 41 docs_only (26%), 35 narrow (22%), 80 everything
(51%) of 156 commits. The per-commit oracle and the per-run reality agree closely on the narrow rate
(22% either way) and are in the same range on docs-only (26% vs 18% - pushes can bundle several
commits, one of which is non-docs, which the per-run number correctly reflects and the per-commit
number cannot); both are within the ARCH-15 "roughly one in six" expectation's ballpark, on the low
side for page-only specifically.

**ARCH-21 (split `site`): not worth doing.** Page-only narrows are 1/55 runs (2%), far under the "one
in ten" bar this ticket's own acceptance set. `src/pages/**`/content changes essentially never land
without a tool or shared-core file in the same push in this window.

**DEBT-07 (finish the `SignMessages` cut, drop `editor` from `CORE_PROJECTS`): worth finishing, but
its ceiling is small.** The `core project(s) affected` bucket is 12/55 runs (22%) - the entire
population this cut could move, and only the subset of those 12 where `editor` was the *only* core
project affected (via the `i18n` re-export) would actually flip to `narrow`; DEBT-07's own
"Investigated" section has the per-commit detail on how many of those are that specific edge versus
`shell`/`lib` genuinely changing too. Even a best-case flip of all 12 only trades a 178s-median
`everything` run for a ~161s-median `narrow` run - real, but the wall-clock case for DEBT-07 is
weaker than its architectural case (a real, named dependency direction instead of an attribution
artifact). Recommend finishing it on the architecture merits already stated in DEBT-07, not on a
wall-clock promise this data does not support.

**Is Nx worth its footprint?** Yes, keep it, but the highest-leverage remaining lever is not ARCH-21
or DEBT-07: 14/55 (25%) `everything` runs, the single largest reason after `core project(s)
affected`, are `unowned files` under `scripts/` - test infra, fixtures and guard scripts that no Nx
project claims, so any touch to them (which routine guard/test maintenance does often) forces a full
run regardless of how precise the tool boundaries are. That is a different, cheaper fix (give
`scripts/` or its test-relevant subfolders project ownership) than either ticket this one was asked
to judge; it is not itself in scope here, so it is left as an observation rather than a new
recommendation this ticket makes a call on.

Data and script: `scripts/ci-narrowing-report.mjs --since 9b4f944 --events push`. Raw cache not
committed (gitignored, regenerate with the same command).

## Addendum: the per-job columns and who sets the wall (2026-09-18, later the same day)

The Result above answered the bucket question. This pass (the scheduled re-measurement this ticket's
Scope asked for) adds the columns the Scope named but the first run of the script did not print:
`e2e-webkit`'s two Playwright steps, both `font-guards` shards' step and job times, and the run's
longest job. `scripts/ci-narrowing-report.mjs` prints them now, plus a per-job median block for
QUAL-06 / QUAL-09. Same window, five more `push` runs (60), same shares: 11 docs-only (18%), 13
narrow (22%), 36 everything (60%); medians 12s / 154s / 178s.

**Who sets the wall.** On the 40 green non-docs runs, the longest job was a `font-guards` shard 32
times (shard 2 on 16, shard 1 on 8, the pre-QUAL-06 single job on 8), `e2e-webkit` 6 times, a
chromium `e2e` shard twice. Per-job medians on the 30 green `everything` runs, in job time
(checkout through the last step, the unit QUAL-06 and QUAL-09 measured in) and step time (the
Playwright step alone):

| job | step median | job median | ticket target | first measurement (2026-09-14) |
| --- | --- | --- | --- | --- |
| `font-guards (1)` | 87s | 139s | under 120s (QUAL-06) | 137-154s |
| `font-guards (2)` | 106s | 154s | under 120s (QUAL-06) | 142-180s |
| `e2e (1)` chromium | 60s | 120s | under 100s (QUAL-09) | 96-142s |
| `e2e (2)` chromium | 68s | 128s | under 100s (QUAL-09) | 77-121s |
| `e2e-webkit` | 42s + 15s perf | 136s | under 120s (QUAL-09) | 110-147s |

The fixed cost in front of every Playwright step (checkout, `npm ci`, affected-scope, build, browser
cache restore plus `install-deps`) is about 54s per chromium or font job and 79s for `e2e-webkit`
(webkit's browser install is the slow one, QUAL-09's own finding), so none of the three jobs can
meet its target while its step alone is over 45-60s. The two imbalances are the cheap levers, not a third shard:

- Font shard 2's step runs about 20s longer than shard 1's (106s against 87s), so
  `playwright.config.js`'s hand-balanced `fonts-shard-1`/`fonts-shard-2` split has drifted since
  QUAL-06 measured it; moving one mid-sized guard across would cut the wall by roughly 10s on every
  run where the guards execute (43 of 60; the report counts the unsharded pre-QUAL-06 job too).
- Chromium shard 2's step went from 55s to 82-90s on 2026-09-17 in two stages, while shard 1
  stayed at 55-63s. First QUAL-10 landed three saved-work-restore acceptance specs (129 to 139
  tests; shard 2 at 64-65s on the two failed runs `acd70698`/`63eaa268` that carried them). Then
  DEBT-13 deleted one spec (`unlock-reset-confirmation.spec.js`) and folded another's assertions,
  and Playwright's count-based `--shard` reassigned the split from 70/69 to 72/66: shard 2's step
  went to 70s on `e0c16e19` and 82-90s from `61d7f91a` on, on a *smaller* count. That second step is
  consistent with a heavy spec landing in shard 2 on the reshuffle (inferred from timing, not
  bisected; no spec file changed between `e0c16e19` and `61d7f91a`). Either way a count-based split
  drifts whenever a spec file is added or removed; a `--shard` that balances by measured time (the
  way QUAL-06 did for the font guards) is the same fix as the row above.

**Narrowing to Sign or Redact does not move the wall.** `tool-sign` is an implicit dependency of
`fonts`, so every Sign or Redact narrow run also runs the full font-guard suite (guards ran on 6 of
the 10 green narrow runs, all of them Sign/Redact). Median wall for those six runs: 170s, against
180s for the 30 green `everything` runs, a difference inside run-to-run noise (the six span 146s
to 188s, and shard 1 alone varies 45-63s on the same 68 tests). The green narrow runs that skipped the guards (Merge, the
one page-only run) sit at 120-132s, plus one queued outlier at 541s. That is the number DEBT-07
should read: flipping `editor` out of `CORE_PROJECTS` turns an editor-only push from a 180s
`everything` run into a ~170s Sign/Redact narrow run, about 10s and within noise, because
`font-guards` sets the wall either way. The unit-test step still drops 3x (61s to 22-30s), which is the developer-facing
win locally, not the CI wall.

**Cross-check on the last 40 commits** (`node scripts/nx-affected-histogram.mjs --count 40`, on
`HEAD` = `19dca856`, after ARCH-22 gave `scripts/` its `tooling` projects this evening): 10
docs_only (25%), 17 narrow (43%), 13 everything (33%). The 13 `push` runs that carried those 40
commits were 2 / 5 / 6. Two things explain the gap, both already named above: the oracle runs on
today's graph, where ARCH-22's ownership turns the `unowned files: scripts/...` verdicts of two of
those six `everything` runs into narrow ones, and a push bundles commits (`a6a38399`, a one-file
`editor-ui` CSS change the oracle narrows to Sign/Redact, shipped in the same push as `becb5e2f`,
which touched shared files, so CI correctly ran everything). Per-commit rates are an upper bound on
per-push rates; the Result's 156-commit cross-check already said so for docs-only, and it holds for
narrow too.

## Addendum (2026-09-18): the fonts edge inflated the measurement

Filed the same day ARCH-23 landed (from CI run 35380358167, commit `15396adf`, a tooltip-only Sign
change that still paid the full 27-guard cost). Shlomi's question: the two passes above report
`fonts=true` and `everything=true` as if every one of those runs legitimately needed what it ran.
ARCH-23 found one concrete counterexample (the `tool-sign` implicit-dependency edge). This addendum
checks the whole window, not just that one commit: how many of the `fonts=true` and `everything=true`
runs actually touched a file that needed them.

**Method.** `git diff --no-renames --name-only <prev-push-headSha> <this-push-headSha>` for every push
in the window - `<prev-push-headSha>` is the previous push's own `headSha` in the same chronologically
sorted run list `ci-narrowing-report.mjs` already fetches, which is exactly what `ci.yml`'s `scope`
job resolves as `BASE` (`github.event.before` on a `push` event - see `.github/workflows/ci.yml`'s
`Classify the change against its base` step), so this reconstructs the same diff CI narrowed against,
not an approximation. Verified directly: the reconstructed diff for `a6a38399` includes `becb5e2f`'s
files too, matching this ticket's own Cross-check note above that the two commits shipped in one push.
Working script (not committed, per the ticket's instruction to keep a one-off in the scratchpad):
`/private/tmp/claude-501/-Users-sh-work-pdkef/66b25542-5e58-4a7b-a7b2-3ce554488fdb/scratchpad/classify.mjs`,
key logic:

```js
const base = i === 0 ? '9b4f944' : pushRuns[i - 1].headSha;
const files = git(['diff', '--no-renames', '--name-only', base, run.headSha]);
const rightful = files.some((f) => FONTS_AND_TEXT_MD_PATHS.some((g) => f.startsWith(g)));
```

**Rightfully-fonts rule.** A `fonts=true` run counts as rightful when its changed-file set intersects
`.claude/rules/fonts-and-text.md`'s own `paths:` frontmatter (the maintained list of what feeds the
font/text pipeline - `src/editor/text/**`, `public/fonts/**`, the guard/parity/language-acceptance
specs under `e2e/sign/`, `THIRD_PARTY_LICENSES.md`, etc. - reused rather than a second hand-written
list, the same principle ARCH-23's Scope already states for the Nx side of this fix). `wide()` sets
`fonts: true` unconditionally for every `everything=true` verdict ("everything always means run the
font guards too" - `scripts/affected-scope.mjs`'s own comment), so on an `everything` run fonts=true
is not a separate decision to grade; it is entailed by whether `everything` itself was rightful, which
is the second half of this addendum. Only a **narrow**-verdict run can show `fonts=true` from a real,
gradable decision - and, since `editor`/`lib` are `CORE_PROJECTS` (any real change there already
forces `everything`), the only way a *narrow* run affects the `fonts` project is the `tool-sign`
implicit-dependency edge ARCH-23 found.

**Window.** `9b4f944..HEAD`, `push` events: 62 runs (two more than this ticket's own 60-run addendum
above, landed later the same day - one of them, `15396adf`, is the commit that filed ARCH-23). Same
shares as before: 11 docs_only (18%), 15 narrow (24%), 36 everything (58%).

**Narrow runs with `fonts=true`: 8 of 62 (13% of all runs, 53% of the 15 narrow runs) - all 8 are
coarse.** Every single one, checked file-by-file against the rule above: `d144fd18`, `1dbce72a`,
`025f1f78`, `6168e6c7`, `81162a01`, `23289b79`, `d42f7cc3`, `15396adf` (the filing commit itself).
None touched a single fonts-and-text.md path - the changed files are toolbar/tooltip/arming-UI
components (`SignToolbar.tsx`/`.module.css`, `ArmHint.tsx`, `RedactToolbar.tsx`, `ElementToolbar.tsx`,
`ElementResizers.tsx`, `DraggableWrapper.tsx`, `FullscreenButton.tsx`), their tests, or unrelated
backlog/doc files bundled into the same push. Median wall 169.5s (range 146-188s) - matching this
ticket's own 170s finding for this population almost exactly, which is the point: **every** run in
that 170s-median bucket paid the full 27-guard cost for zero incremental coverage, not "some of them,"
because the edge that puts them there (`tool-sign`) has no file-level granularity at all. This is
ARCH-23's exact scope, now measured across the whole window instead of one commit.

**Everything runs (36 of 62): the `core` bucket splits about evenly, the `unowned` bucket's coarse
share is already fixed.** Bucketed by `affected-scope.mjs`'s own reason string, then each run's actual
files checked against whether the full run was plausibly needed:

| everything reason | n | plausibly needed | coarse | median wall (plausible / coarse) |
| --- | --- | --- | --- | --- |
| `core project(s) affected` | 14 | 7 | 7 | 174s / 167s |
| `unowned files` | 22 | 18 | 4 | 219s / 174.5s |
| (all everything) | 36 | 25 | 11 | - |

- **`core`, coarse (7 of 14):** `8edc224a`, `79c2238c`, `61d7f91a`, `ab7bbb29`, `a9909076`,
  `5b0a220c`, `e0c16e19` - five of these are a localized-content YAML (`he/merge.yaml`,
  `he.yaml`) or `src/i18n/toolMessages.ts`/`cardMessages.ts` reaching `editor` through the same
  `site -> i18n -> editor` hub DEBT-07's "Investigated" section already names, and two are
  `src/data/tools.js` (the tool registry) reaching `editor`/`shell` the same structural way. None of
  the seven touch a text/font file; the actual PRs are Split-tool, Hebrew localization, or a tool-list
  edit. This is DEBT-07's own question, not ARCH-23's - noted in DEBT-07's ticket, not fixed here.
- **`core`, plausible (7 of 14):** `205b68b2` (`site-lib/gitLastModified.js`, genuinely rendered on
  every content page), `2ac958fe` (`src/shell/ToolShell.tsx`, shared shell chrome), `ce29a85f`
  (`src/shell/RecentFiles.tsx`, shared shell chrome), and four (`a848570c`, `a6a38399`, `fcae9d81`,
  `097c8ed1`) that touch `src/editor/text/combPlacement.ts` directly - `src/editor/text/**` is itself
  a fonts-and-text.md path, so these four are independently rightful for the fonts question too, not
  just for `everything`.
- **`unowned`, coarse (4 of 22):** `07fc20e9` (`scripts/affected-scope.test.mjs` alone - a test file
  ORACLE_FILES deliberately excludes, unowned only because `scripts/` itself had no Nx project yet),
  `63eaa268` and `4325853b` (`scripts/spike/mobi-10/**`, an unrelated OCR spike), `2f8c0bcb`
  (`scripts/ci-narrowing-report.mjs`, this ticket's own new script). **All four are already fixed**:
  ARCH-22 (commit `19dca856`, inside this same window) gave `scripts/` and `scripts/spike/mobi-10/`
  real Nx ownership, so an identical diff today would no longer hit the "unowned files" rule for any
  of them. This is exactly the "root-project trap" lever this ticket's Result section already flagged
  as the highest-leverage remaining item - now measured (4/22, 18% of the `unowned` bucket) and
  confirmed closed by ARCH-22 rather than still open.
- **`unowned`, plausible (18 of 22):** `.github/workflows/ci.yml` itself (6 runs), `package.json`/
  `package-lock.json` (3), `playwright.config.js`/`vitest.config.js`/`astro.config.mjs` (5),
  `scripts/affected-scope.mjs`/`change-scope.mjs` before ARCH-22 gave them `ORACLE_FILES` treatment
  explicitly (3), `middleware.ts`, `.gitignore`+`tsconfig.json`, `THIRD_PARTY_LICENSES.md` (which is
  itself a fonts-and-text.md path, so rightful for fonts specifically, not just plausible for
  everything).

**Headline.** Of the 44 `fonts=true` runs in the window (36 everything + 8 narrow), 19 (43%) were
coarse by this measurement, not 30-of-30 or "most" in the way the open question suspected - most
`fonts=true` runs (25 of 44, 57%) were riding a genuinely wide `everything` run for a genuinely
cross-cutting or self-referential change. But narrowing further: of those 19 coarse runs, 4 are
already resolved by ARCH-22 (landed inside this same window), leaving **15 of 62 runs (24%) still
live** - 8 that are ARCH-23's exact, already-scoped fix (100% coarse rate, zero counterexamples in
this window) and 7 that are DEBT-07's exact, already-scoped question (50% coarse rate within the
`core` bucket). Neither number was visible in this ticket's first two passes because both only asked
"did fonts run" and "what was the median wall," never "did the changed files justify it."

**What still holds from the Result and first Addendum above, and what changes:**

- **ARCH-21 (split `site`): unaffected, still not worth doing.** This addendum did not re-measure
  page-only narrows; nothing here bears on that number.
- **"Narrowing to Sign or Redact does not move the wall" (first Addendum): correct as a wall-clock
  statement, misleading as a priority signal.** 169.5s against 178s for `everything` is inside noise,
  exactly as measured before - font-guards is the long pole in a parallel job graph either way, so
  fixing the `tool-sign` edge does not shrink a run's wall-clock by much. But "does not move the wall"
  was read as "therefore low-value" for ARCH-23; this addendum's 8-of-8 (100%) coarse rate says the
  value is not in wall-clock, it is in CI compute: two font-guards shards at 2:29+2:38 each of these 8
  times is roughly 40 runner-minutes spent in this single five-day window for zero incremental guard
  coverage (ARCH-23's own Problem section already showed the 6 `/sign`-navigating guards don't
  exercise the toolbar at all). Wall-clock was the wrong lens for this specific ticket's cost; compute
  minutes were not measured by either of QUAL-08's first two passes and should have been.
- **DEBT-07 ("worth finishing, ceiling small"): still holds, now with a number instead of an
  inference.** 7 of 14 `core`-bucket everything runs (50%) are exactly the `site`/`i18n` -> `editor`
  hub-reach pattern DEBT-07 already named as unresolved; median wall for that coarse half (167s) is
  inside noise of the plausible half (174s), matching this ticket's own "the wall-clock case for
  DEBT-07 is weaker than its architectural case" conclusion - not overturned, now with the actual
  split behind it. See DEBT-07's own addendum for the number in context.
- **"Is Nx worth it? Keep it, biggest lever is `unowned files`" (Result section): the specific lever
  named is already gone.** This addendum confirms all four measured `unowned`-coarse cases predate
  ARCH-22 and would not reproduce today. The Result section's own words already said as much
  ("ARCH-22 has since given `scripts/` real ownership... which is the change that actually raises the
  narrow rate" - DEBT-07 input, 2026-09-18) - this addendum is the first pass to actually check that
  no *other* `unowned`-coarse pattern survived it, and none did in this window.
- **Net new conclusion this addendum adds, not present in either pass above: ARCH-23's edge is not
  "a case that mattered once" (its own Problem section's framing) - it is the only remaining source
  of coarse `fonts=true` runs in this entire window, with a 100% measured coarse rate and zero
  counterexamples.** See ARCH-23's own Problem section for the number carried over.

**Correction after the owner's rule (2026-09-18, same day):** the 19-of-44 (43%) coarse figure above
used "touches a `fonts-and-text.md` path" as the rightfulness test, which is generous - it counts an
`editor`/`lib`/`tool-sign` change as rightful whenever *anything* under `src/editor/text/` moved, and
it grades an `everything` run's `fonts=true` as automatically rightful once `everything` itself is
rightful. The owner's actual rule ("no new font added or change in an existing one" - stated in full
in ARCH-23) is narrower than that on both counts: it does not treat every core-project `everything`
verdict as entitled to force the guards, and it does not treat the whole `src/editor/text/` directory
as "font" (most of it is shaping/runtime code - `combPlacement.ts`, `dateFormat.ts`, `bidiRuns.js`,
`hebrewComposition.js` - not the catalogue). Regrading the same 44 `fonts=true` runs against ARCH-23's
narrower, owner-stated list: only 13 touch anything in the broad `src/editor/text/` reading, and only
6 of those touch the actual catalogue/guard files this ticket now proposes gating on - so **31 of 44
font-guard runs (70%) were unnecessary under the owner's rule, not the 19 (43%) this addendum
reported a few hours earlier**, because a generic `everything` verdict was never a rightful reason for
`fonts=true` on its own. See ARCH-23's "Owner's decision" section for the full breakdown and the
proposed fix (a narrow file-glob in `scripts/affected-scope.mjs`, replacing `wide()`'s unconditional
`fonts: true`).
