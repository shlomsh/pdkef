---
id: "DEBT-26"
title: "Rate-limit /api/report at the firewall, so a forged flood cannot spend the day's cap"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "next"
order: 4
depends_on: ["DEBT-17"]
---

# DEBT-26 · Rate-limit /api/report at the firewall, so a forged flood cannot spend the day's cap

*Filed 2026-10-01, from DEBT-17's review.* `/api/report` is anonymous by design, so a valid report is
trivial to forge. The endpoint caps itself at 5,000 counted reports a day and stops calling the store
once a warm instance has seen the cap, but a flood can still use up the day's cap (real reports are
then dropped until midnight UTC) and cost function invocations against Hobby's limits.

## Acceptance

- [ ] Check what Vercel's firewall offers on Hobby for a per-IP rate limit on one path, and add a
      rule for `/api/report` (for example, a handful of requests per minute per IP) if it is free.
- [ ] If it is not available on Hobby, record that here and close; the in-code cap stands.
