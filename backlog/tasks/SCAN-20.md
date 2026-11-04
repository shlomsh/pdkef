---
id: "SCAN-20"
title: "Scan next: a real-photo dewarp corpus with a straightness score"
status: "open"
priority: "P2"
epic: "scan-next"
horizon: "next"
order: 6
depends_on: ["SCAN-17"]
---

# SCAN-20 · Measure the dewarp on real pages, not one form

*Opened 2026-11-04* after SCAN-17 was tuned on synthetic pages and a single prod scan of a creased form.

## Why

Every dewarp change since SCAN-17 (and SCAN-19's learned model) needs a number on real photos, the way
SCAN-05 gave detection one. Without it, a fix that straightens one form can quietly bend another.

## Outcome

- 15-20 real phone photos, each with the person's approved corners: creased forms, curled pages, a
  book page, text-only pages, flat pages (flat ones guard against false bends), some at a slight tilt.
  No personal details: blank or sample forms only.
- A scorer that runs `processPage`'s flattening in Node (as the SCAN-17 checks did) and reports, per
  photo and overall: how far vertical rules stray from straight and plumb, how far rows and rules stray
  from straight, and for flat pages, that nothing moved.
- A baseline table in this ticket (plain homography against today's dewarp), and a vitest guard that
  fails when a change makes any photo worse than its recorded score by more than a set margin.

## Acceptance

- [ ] The corpus and labels are in the repo (sizes kept small, like `lib/edges/real/`).
- [ ] The before-and-after table for today's dewarp is in this ticket.
- [ ] The guard runs in `npm test` and fails on a deliberately worse setting.
