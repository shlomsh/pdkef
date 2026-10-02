---
id: "DEBT-36"
title: "The daily error read sorts reports into regression, old tab and new, and shows what is new and what is rising"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: ["DEBT-35"]
---

# DEBT-36 · The daily error read sorts what needs attention from what is known

*Filed 2026-10-02, from the first read with stamped builds (DEBT-35).* The digest prompt carries every
fix as prose (DEBT-30, ENC-02, Redact's usage start) and the reader prints counts with no sense of
what is new, what is recurring and what is rising. Redact showed 11 failed of 21 started and nothing
in the output said that is high.

## What to build (reader and digest only, no store or privacy change)

1. **A known-items registry in the repo, `docs/error-known-items.json`.** One entry per reported
   defect: a match (`area`, `name`, `step`, `slug` of the tool page, `module` of the top frame; each a
   string or a list, any left out matches anything), the ticket, `fixedIn` (a commit) or `open`.
   `errors:read` classifies each fingerprint against it and its build:
   - fixed, build contains the fix: **regression** (needs attention);
   - fixed, build predates the fix: **old tab** (known, not actionable);
   - fixed, no build stamp: for a fix older than stamping it **cannot be told** from the report alone
     (the tab may be the build that shipped the fix; resolve it) and stays visible; for a fix newer than
     stamping it is a **likely old tab**, never certain, because a build deployed without a commit (a CLI
     `vercel deploy`) sends no stamp either;
   - open entry: **known, open**, with its ticket;
   - no entry: **unknown** (needs attention), stamped or not.
   Whoever fixes a reported crash adds its entry in the same change (one sentence in the "Catching
   errors" rule), so closing a defect retires its prose in the prompt.
2. **New versus recurring, and a baseline.** `errors:read` also fetches a history (default 14 days) and
   prints, per fingerprint, the first day seen and the days seen; and per tool the failure rate
   (`failed / started`) in the window against the earlier history, flagging a tool whose rate is at
   least double its baseline with at least 3 failures, or that has failures and no baseline.
3. **The output leads with the verdict.** A "Needs attention" block (regressions, unverifiable, new,
   rising tools), then known old tabs as one line each, then the existing detail unchanged.
4. **The digest prompt** is rewritten around that block, the hardcoded known items move out of it, and
   its wrong line (an unstamped report is old code) is corrected.

## Not in this ticket

Counting reports per build (a second hash in the store, 2 more commands per report against the free
tier's budget) and a failure reason on usage events (a schema and disclosure change). Both are
offered to Shlomi separately.

## Acceptance

- [x] The registry, its matcher and the classifier are pure and unit-tested, including each verdict above.
- [x] `errors:read` prints "Needs attention" first, with a reason per line, and still prints every
      existing section.
- [x] First-seen, days-seen and the tool failure-rate flag are pure functions with tests on fake store
      replies.
- [x] Run against the real store, today's reports classify as expected: the Redact pdf.js `TypeError`s
      are UNKNOWN; the Unlock `ReferenceError` and Redact encrypted ones are UNVERIFIED, because their tabs
      carry no stamp and both fixes shipped before stamping did (see below), so they say "resolve it".
- [x] The digest prompt is updated; the rule says to add an entry when fixing a reported crash.
- [x] `check:push` green; fresh review with no shared context.

## Decisions and what the review changed (2026-10-02)

`STAMP_COMMIT` is `f27c2b71`, the first *deployed* commit whose build is stamped: the stamping commit
(`2f19bbbb`) reached production inside that push, while DEBT-34's fix (`01bf5820`) sits on the other side
of the merge and shipped, unstamped, in the push before it. So an unstamped Unlock report really can be
a build that contains the fix. A fresh reviewer proposed `2f19bbbb`; that would call it an old tab and
hide a real regression, so the code and the test stay.

Fixed from the review, test first (red runs seen):

- the fix-newer-than-stamping case is `likely_old_tab`, not a certain old tab (a CLI deploy has no stamp);
- the registry validator rejects a one-key match (it would swallow a class of reports), an empty string
  (it matches a missing field), and a non-string `fixedIn`; a lone two-letter path (`/he/`) is the home page;
- a verdict depends on the latest sample of a fingerprint while the count covers all of them, so a fixed
  defect with several reports says "judged on the latest of N reports";
- the label for "not in the registry" is `UNKNOWN`, no longer `NEW` (it clashed with the history wording);
  "first seen" reads as a floor ("earliest in history"), and the footer says a rebuilt chunk changes the
  fingerprint;
- `Needs attention: nothing` is never an all-clear by accident: store errors, a short reply and a day at its
  cap print a `WARNING` line first;
- a tool with no usable baseline (under 5 earlier starts, or none) flags only when at least 20% of its runs
  fail, so 3 failures in 1000 do not read as rising;
- `git fetch` runs only when there is something to look up, and the registry is read from `origin/main`
  (the working-tree file is the fallback), so a lagging shared checkout does not make known crashes unknown;
- a missing reply is an empty one, not `undefined`; the unused `latestSamples` is gone;
- `scripts/errors-read.test.mjs` runs the real script against a local stand-in for the store and proves the
  window-only counting end to end, which was the one claim no unit test could carry.

## Known gaps, not in this ticket

- A build deployed from the CLI (`vercel deploy --prod --force`, used when a `patches/` file changes) has no
  `VERCEL_GIT_COMMIT_SHA`, so its reports are unstamped. They read as UNVERIFIED or likely old tabs.
  Passing the SHA on that command would close it.
- Counting reports per build, and a failure reason on usage events, are still offered separately.

## Outcome (2026-10-02)

`npm run errors:read` leads with "Needs attention" (regression, unverified, unknown, rising tools) and
then "Known, not actionable", then the existing detail, each fingerprint with its verdict, first-seen and
days seen. The known items live in `docs/error-known-items.json`, and the "Catching errors" rule says a fix
for a reported crash adds its entry. The daily digest prompt was rewritten around that output.
