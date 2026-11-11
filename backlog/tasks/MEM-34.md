---
id: "MEM-34"
title: "Worker install reuses what the page just loaded, and a same-build page is not refetched"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-34 · Worker install reuses what the page just loaded, and a same-build page is not refetched

*Filed 2026-11-11*, steps 1 and 3 (navigation refresh) of [docs/request-budget.md](../../docs/request-budget.md).

## Why

Install fetches every unhashed file with `cache: 'no-cache'`, so it asks the CDN again for each file the page
loaded seconds earlier. And every cached navigation refetches its page in the background, even when the
cached page is already this build's.

## What

- Install tries `cache: 'force-cache'` first and keeps the bytes when they hash to the manifest's value
  (MEM-22's check); a miss or mismatch falls back to today's `no-cache` fetch and MEM-29's `reload`.
- A cached navigation whose page already hashes to this build's manifest value skips the background
  refresh.

## Done when

- [ ] `scripts/sw.test.mjs` shows a matching HTTP-cached file stored with no `no-cache` request, a mismatch
      falling through, and a same-build cached page served with no refresh fetch.
- [ ] Landed, and MEM-33's budgets lowered to the new figure.
