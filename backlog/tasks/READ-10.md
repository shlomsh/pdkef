---
id: "READ-10"
title: "Sign adopts the Reading lamp capsule in fullscreen"
status: "open"
priority: "P3"
epic: "highlight-pdf"
horizon: "later"
order: 10
depends_on: ["READ-05"]
---

# READ-10 · Sign adopts the Reading lamp capsule

*Split from READ-05 on 2026-11-01.* Highlight PDF shipped the fullscreen capsule while Sign stayed
backwards compatible, keeping its own fullscreen toolbar. This ticket brings the capsule to Sign. The same
requirements apply: READ-01's R15 to R19, and [docs/highlight-pdf.md](../../docs/highlight-pdf.md),
"Fullscreen is the reading lamp".

## Outcome

Sign's fullscreen shows the same capsule as Highlight PDF, with Sign's armed tool in it. Leaving
fullscreen restores today's toolbar exactly.

## Acceptance

- [ ] The capsule moves from `src/tools/highlight/components/capsule/` to shared chrome once Sign is its
  second consumer, with no copy left behind.
- [ ] Arming any Sign tool in fullscreen does not move the capsule (the SIGN-30 rule).
- [ ] Sign's fullscreen e2e specs pass against the capsule at two desktop widths and 375 px.
