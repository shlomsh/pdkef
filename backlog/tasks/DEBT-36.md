---
id: "DEBT-36"
title: "The daily error read sorts reports into regression, old tab and new, and shows what is new and what is rising"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
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
   - fixed, no build stamp: an unstamped tab is older than the stamp commit, so it is certainly old
     only for a fix newer than the stamp; for an older fix it **cannot be told** from the report
     alone (resolve it) and stays visible;
   - open entry: **known, open**, with its ticket;
   - no entry: **new** (needs attention), stamped or not.
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

- [ ] The registry, its matcher and the classifier are pure and unit-tested, including each verdict above.
- [ ] `errors:read` prints "Needs attention" first, with a reason per line, and still prints every
      existing section.
- [ ] First-seen, days-seen and the tool failure-rate flag are pure functions with tests on fake store
      replies.
- [ ] Run against the real store, today's reports classify as expected (Unlock `ReferenceError` and
      Redact encrypted as known; the Redact pdf.js `TypeError`s as new).
- [ ] The digest prompt is updated; the rule says to add an entry when fixing a reported crash.
- [ ] `check:push` green; fresh review with no shared context.
