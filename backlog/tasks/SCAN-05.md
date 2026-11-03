---
id: "SCAN-05"
title: "Scan next: a real page-detection corpus with scored KPIs"
status: "open"
priority: "P1"
epic: "scan-next"
horizon: "now"
order: 3
depends_on: []
needs: "Photos and short videos of real pages taken on your phone, ours to check in"
---

# SCAN-05 · A detection corpus that can tell detectors apart

*Opened 2026-11-03* from the detection research for [docs/scan-next.md](../../docs/scan-next.md).

## Why

Page detection becomes the heart of Scan: it draws the live outline and decides when a page is taken. Today's
corpus (`src/tools/scan/lib/edges/corpus.ts`) is 18 synthetic scenes plus one real photo, and it scores 18 of
18 with corner errors of 0.002 to 0.006 of the frame (measured 2026-11-03). It is saturated: it cannot show
whether a change helps or hurts on the photos people take. Nothing covers shadow, glare, white page on a white
table, clutter, a curled page, a page partly out of frame, a hand holding it, or video.

## Outcome

- **Photos:** 150 to 300 real phone photos of pages across those conditions, with the four corners
  hand-labelled (normalized, upright, the contract in `docs/scan-to-pdf.md`). Only photos we own or have
  consent for, since fixtures are checked in; stored small (gray, 320 px long edge) to keep the repo light.
- **Video sequences:** 30 to 50 clips of 3 to 5 s, kept as per-frame labels rather than video files: page
  arriving, held steady, swapped for the next page, no page. Each marks where a capture should fire.
- **Scored KPIs**, one table printed by the test and asserted with thresholds: median and max corner error,
  IoU, found-rate at 0.02 / 0.035 / 0.08, confidently-wrong rate, `null` on no page, and for sequences: time
  to lock, false captures, double captures. A time budget per frame on the corpus.
- The 18 synthetic scenes stay as the fast smoke test.
- Today's detector is the recorded baseline, as READ-20 did for the reader.

## Acceptance

- [ ] The corpus and its labels are in `src/tools/scan/lib/edges/` with a labelling note (how corners were
      marked, which conditions each photo covers).
- [ ] The KPI table runs under `npm test` and today's detector's numbers are recorded in this ticket.
- [ ] The thresholds fail a change that makes any KPI worse than the baseline.
