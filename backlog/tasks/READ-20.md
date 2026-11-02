---
id: "READ-20"
title: "One page layout shared by highlighting and field detection"
status: "in_progress"
priority: "P2"
epic: "highlight-pdf"
horizon: "now"
order: 20
depends_on: ["READ-01"]
---

# READ-20 · One page layout, read once, shared

*Filed 2026-11-01 as READ-10; revived as READ-20 on 2026-11-02.* The READ-10 id went to "Sign adopts the Reading
lamp capsule" while this work sat on an unmerged branch (`claude/read10-layout-382106`). Its corpus commits were
brought onto main unchanged, so their messages still say READ-10. Requirements: [READ-01](READ-01.md), R30 to R38. Design record:
[docs/highlight-pdf.md](../../docs/highlight-pdf.md).

## Outcome

READ-01's R34 to R38 hold: one pure layer reads a page raster (and its text runs when there are any) into a
`PageLayout` once per page, behind one contract with swappable strategies and a declared order; every
reader (highlight bands, Sign's passage comments, field detection, SNG-09's snap) takes that layout and none
keeps its own row or column finder; OCR can later plug in once as a word source; the three R33 failures are
fixed page-wide; and the layout has its own corpus beside `corpus/snap/`, scored and ratcheted.

## Order, test first (from READ-01)

1. Export the prep from `rasterInk.js` and use it in `textRows` (no behaviour change).
2. Move the code to its shared home with READ-02.
3. **Build the corpus and score today's reader, with the three R33 failures as known-gap rows.** (this slice)
4. Add the contract and the page-level `rasterRows`.
5. Switch the swipe reader to the cached page layout.
6. Then fields, snap, and OCR.

Step 5 is the riskiest: a page is about 3.9 Mpx, the reader has never been timed at page scale, and its
thresholds were tuned for a three-line strip. It stays behind today's windowed path until the swipe KPI from
this corpus and a real iPhone agree, and it does not ship before both.

## This slice: the corpus and the baseline

`src/tools/sign/lib/fields/corpus/layout/` (README there has the contract), reusing `corpus/snap/`'s seeded
degradation (levels clean, scan, fax, phone), its Clopper-Pearson bound and its correct / wrong / declined
scoring, and `corpus/scoring/match.js`'s greedy matcher. Truth comes from the text of digital multi-column
pages (licence-clean sources only, each recorded with its licence), rendered and then degraded into scans.
Pinned rows each hold one known zero (gutter dust, a spanning heading, a margin speck, a drop cap, a pull
quote); the three R33 failures are known-gap rows that a fix flips. `npm run score:layout` prints the
scores and diffs them two ways against `layoutBaselines.json`.

Today's reader works on a window, so the baseline adapter calls it around each truth row, the way a swipe
does, through the real `createSwipeReader` over a canvas-shaped raster. The reader itself is not changed
here.

## Acceptance

- [x] `npm run score:layout` prints today's scores per level, and the baseline is committed.
- [x] The three R33 failures show as failing known-gap rows, each pinned so a fix flips it.
- [ ] The contract and the page-level `rasterRows` land, scored on this corpus.
- [ ] The swipe reader reads the cached page layout, the swipe KPI holds per level, and it is checked on a
  real iPhone before it ships.
- [ ] Fields, snap and passage comments read the layout; the field baselines are re-scored when they do.
