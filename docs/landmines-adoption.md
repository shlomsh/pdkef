# Honest tests: adopting landmines

*Opened 2026-11-18.* Lane `honest-tests`, tickets `LAND-*`.

[landmines](https://github.com/interfere-inc/landmines) (`@interfere/landmines`, MIT) is a set of
Oxlint JS-plugin rules that stop tests from passing without proving anything: polling a spy against a
deadline, fixed sleeps, raised timeouts, replaced dependencies. pdkef enforces its other invariants with
hand-written `scripts/check-*.mjs` ratchets. For these rules the decision is the opposite: **use the
open-source rules as they ship, and when one misses a pdkef pattern, fix it upstream** rather than
writing another local guard.

## The trial (2026-11-18, origin/main 9f43c5d07)

`oxlint@1.94.0` + `@interfere/landmines@0.1.0`, recommended config, over `src scripts e2e api
middleware.ts`: 30,908 findings in 2,487 files, about 3 seconds.

| Rule | Hits | Verdict |
| --- | --- | --- |
| `no-unsignaled-poll` | 22 in 9 files (+1 parse error in an `.astro` file) | **Adopt first (LAND-01).** `vi.waitFor` / `expect.poll` on a spy or a recorder races a deadline that CPU load (tests on battery) can miss. No flake was reproduced; the gain is a wait bounded by the test timeout instead of a 1 s poll. |
| `no-fixed-sleep` | 8 | **Rule misses most of ours (LAND-02).** It only sees a sleep whose nearest enclosing function is the `it(...)` callback, so `await act(async () => { ...; await new Promise((r) => setTimeout(r, 50)) })` is invisible, and it drops every sleep in a file that calls `vi.useFakeTimers()`. Unit tests hold 141 `setTimeout` sleeps (61 at 0 ms, about 80 longer). It found none of the 39 e2e `waitForTimeout`s, which `check-e2e-sleeps` already ratchets. |
| `no-flake-masking` | 25 in 13 files | **Mostly legitimate (LAND-03).** Raised per-test timeouts on real PDF exports and corpus runs, not hidden flakes. One false positive in production code, `src/tools/sign/lib/flatten.js:191`: a local function named `describe` with three arguments reads as a test with a timeout. Playwright's `retries` (the `perf` project) is not a key it checks. |
| `no-test-doubles` | 1,877 in 266 files | **In waves (LAND-04).** Off on `landmines-all` until upstream takes a per-file `allow` option; the count left then becomes a list that only shrinks. Rules for a real fix: docs/landmines/no-test-doubles.md. |
| `no-comments` | 26,202 | **Declined.** pdkef comments carry ticket ids and the reason a guard exists, on purpose. |
| `no-explicit-return-types` | 2,475 | **Declined.** Style choice that does not fit `checkJs` code. |
| `test-file-names` | 188 | **Declined.** 176 are Playwright `.spec.js`, our convention. |
| `colocated-tests` | 13 | **Adopted on `landmines-all` (LAND-05).** Tests whose subject the rule cannot see carry a disable line naming it. |
| `strict-msw`, `package-exports` | 0 | Not applicable: no MSW, not a published package. |

Oxlint's own default `correctness` rules added about 140 findings (45 unused variables, comma and
short-circuit expressions). The ones opened were style, not bugs; they are switched off in
`.oxlintrc.json` so the lint is landmines only.

## How it runs

`npm run lint:landmines` (in `check:fast`, `check:push` and `ci.yml`). `.oxlintrc.json` turns off
Oxlint's built-in categories and enables only the landmines rules adopted so far. A rule is enabled at
`error` once its sites are fixed, or with its `allow` map (exact per-file counts that only shrink) where
the rule supports one. `scripts/check-ratchet-raises.mjs` treats each rule's `allow` map like
`scripts/ratchet-limits.json`: a raised count or a new file fails, a lower one passes.

Adopted so far: `no-unsignaled-poll` (LAND-01) and `no-flake-masking` with today's 25 timeouts in 13
files (LAND-03). The `src/tools/sign/lib/flatten.js` entry is the rule's false positive on a local
`describe` helper; once the upstream fix ships, the rule reports that entry as stale and it is removed.

## Upstream

Every miss or false positive found here is fixed in landmines, not worked around locally: a failing
rule test first, then the fix, as a PR to `interfere-inc/landmines`. Posting the PR or an issue is
Shlomi's call each time.
