# Honest tests: adopting landmines

*Opened 2026-11-18.* Lane `honest-tests`, tickets `LAND-*`.

[landmines](https://github.com/interfere-inc/landmines) (`@interfere/landmines`, MIT) is a set of
Oxlint JS-plugin rules that stop tests from passing without proving anything: polling a spy against a
deadline, fixed sleeps, raised timeouts, replaced dependencies. pdkef enforces its other invariants with
hand-written `scripts/check-*.mjs` ratchets. For these rules the decision is the opposite: **use the
open-source rules as they ship, and when one misses a pdkef pattern, fix it upstream** rather than
writing another local guard.

## The trial (2026-11-18, origin/main 9f43c5d07)

`oxlint@1.94.0` + `@interfere/landmines@0.1.0` (0.3.2 is installed now), recommended config, over `src scripts e2e api
middleware.ts`: 30,908 findings in 2,487 files, about 3 seconds.

| Rule | Hits | Verdict |
| --- | --- | --- |
| `no-unsignaled-poll` | 22 in 9 files (+1 parse error in an `.astro` file) | **Adopt first (LAND-01).** `vi.waitFor` / `expect.poll` on a spy or a recorder races a deadline that CPU load (tests on battery) can miss. No flake was reproduced; the gain is a wait bounded by the test timeout instead of a 1 s poll. |
| `no-fixed-sleep` | 8 | **Rule misses most of ours (LAND-02).** It only sees a sleep whose nearest enclosing function is the `it(...)` callback, so `await act(async () => { ...; await new Promise((r) => setTimeout(r, 50)) })` is invisible, and it drops every sleep in a file that calls `vi.useFakeTimers()`. Unit tests hold 141 `setTimeout` sleeps (61 at 0 ms, about 80 longer). It found none of the 39 e2e `waitForTimeout`s, which `check-e2e-sleeps` (since retired) ratcheted. |
| `no-flake-masking` | 25 in 13 files | **Mostly legitimate (LAND-03).** Raised per-test timeouts on real PDF exports and corpus runs, not hidden flakes. One false positive in production code, `src/tools/sign/lib/flatten.js:191`: a local function named `describe` with three arguments reads as a test with a timeout. Playwright's `retries` (the `perf` project) is not a key it checks. |
| `no-test-doubles` | 1,877 in 266 files | **On (LAND-04, 2026-11-26).** 292 sites in 122 files left, each on its own `oxlint-disable-next-line` with a `-- Forced:` reason; the count only goes down. Rules for a real fix: docs/landmines/no-test-doubles.md. |
| `no-comments` | 26,202 | **Declined.** pdkef comments carry ticket ids and the reason a guard exists, on purpose. |
| `no-explicit-return-types` | 2,475 | **Declined.** Style choice that does not fit `checkJs` code. |
| `test-file-names` | 188 | **Declined.** 176 are Playwright `.spec.js`, our convention. |
| `colocated-tests` | 13 | **Adopted (LAND-05).** Ten tests whose subject the rule cannot see carry a disable line naming it; the ticket waits on upstream's colocated-tests fix (PR 33). |
| `strict-msw`, `package-exports` | 0 | **On** (none then; `strict-msw` has 2 recorded sites since the MSW waves). |

### Rules new since the trial (2026-11-27, landmines 0.3.2, origin/main 4b3117dc7)

Counts over `src scripts e2e api middleware.ts`.

| Rule | Hits | Verdict |
| --- | --- | --- |
| `no-shared-signal`, `no-stale-render-assertion`, `no-styling-class-assertion`, `no-clipboard-read-text`, `no-imported-mutation`, `no-self-container-query`, `no-github-scripts` | 0 | **On (LAND-06).** `no-self-container-query` also reports child variants such as `*:@md:grid`, which it should not (issue 59); we have none. |
| `no-project-max-workers` | 1 | **Off, false positive.** It reports `vitest.config.js:119`, but Vitest 5.1 does apply a project's `maxWorkers` (`groupSpecs` passes it to `pool.setMaxWorkers`): browser projects run at 3, the root at 9. Already in issue 59. |
| `declared-test-inputs` | 0 | **Off.** It checks Turbo task inputs; pdkef uses Nx. |
| `no-parameter-branch` | 7 in 6 files | **On (LAND-07).** The body computed its expected value from the case, so it mirrored the code under test; every expected value now sits in the case table. |
| `no-elapsed-time-bound` | 6 | **On (LAND-07).** A wall-clock upper bound fails on a slow machine with no bug. All six are deliberate (a kill or an exit that is the behaviour, a hang guard, two linear-time guards, a perf budget) and keep a disable naming why. |
| `no-silent-catch` | 19 in 17 files | **On (LAND-07).** Production code and one dev-only capture tool: best-effort cleanups, optional browser APIs and previews whose failure the page already absorbs. Each keeps its reason on its disable line; none hid a lost save. |
| `no-conditional-expect` | 110 in 54 files | **Adopt in waves (LAND-08).** Some are real silent skips (`if (pageKind) expect(...)`). |
| `no-cold-import-in-test`, `no-cold-start-in-test` | 52 in 27, 113 in 21 | **Adopt (LAND-09).** The 5 s budget measures a module load or a process start; cold starts are where tests run out of time on battery. |
| `padding-between-statements` | 64,530 | **Declined.** Formatting. |
| `no-scripts-directory`, `package-scripts` | 286, 1 | **Declined.** `scripts/` and the `check:*` / `generate:*` names are how pdkef's guards run in CI. |
| `max-exports-per-module`, `max-file-lines`, `max-files-per-directory`, `no-prefix-cluster` | 148, 28, 14, 16 | **Declined.** Layout and size, not test honesty. |
| `test-dir-only-cross-functional` | 22 | **Declined.** `src/test/cross-tool/` and `src/test/seo/` hold tests with no single owner, on purpose; `colocated-tests` already covers misplaced ones. |
| `no-inline-hex-encoding` | 7 | **Declined.** Production code, not tests; one hit is RGB colour formatting, not bytes. |

Oxlint's own default `correctness` rules added about 140 findings (45 unused variables, comma and
short-circuit expressions). The ones opened were style, not bugs; they are switched off in
`.oxlintrc.json` so the lint is landmines only.

## How it runs

`npm run lint:landmines` (in `check:fast`, `check:push` and `ci.yml`). `.oxlintrc.json` turns off
Oxlint's built-in categories and enables only the landmines rules adopted so far. A rule is enabled at
`error` once its sites are fixed, or with its `allow` map (exact per-file counts that only shrink) where
the rule supports one. `scripts/check-ratchet-raises.mjs` treats each rule's `allow` map like
`scripts/ratchet-limits.json`: a raised count or a new file fails, a lower one passes.

Adopted so far, as `landmines/...` rules of the one 0.3.2 plugin: `no-unsignaled-poll` (LAND-01),
`no-flake-masking` (LAND-03), `no-fixed-sleep` (LAND-02, its `allow` map includes 47 e2e sites;
it replaced `check-e2e-sleeps`), `strict-msw`, `colocated-tests` and
`package-exports`, `no-test-doubles` with a disable per kept line, the seven zero-hit rules of LAND-06, and
`no-parameter-branch`, `no-elapsed-time-bound` and `no-silent-catch` (LAND-07). A disable of `no-test-doubles` or a
LAND-07 rule is one line with a reason, checked by `scripts/test-double-reasons.mjs`. Next: LAND-08 and LAND-09. Off: `no-project-max-workers` (false positive) and
`declared-test-inputs` (Turbo); declined: `no-comments`, `no-explicit-return-types`, `test-file-names`
and the nine layout and style rules in the table above.

## Upstream

Every miss or false positive found here is fixed in landmines, not worked around locally: a failing
rule test first, then the fix, as a PR to `interfere-inc/landmines`. Posting the PR or an issue is
Shlomi's call each time.
