---
id: "FORM-17"
title: "A comb with a divider before its last digits is one field, not two"
status: "done"
priority: "P2"
epic: "form-detection"
depends_on: ["FORM-16"]
---

# FORM-17 · A comb with a divider before its last digits is one field, not two

## Why

ภ.ง.ด.90's amount combs draw a bold divider between the whole-number digits and the two satang
digits (on the right-hand sub-tables sometimes a second divider further left). The ink comb reader
(`pageInk.js`/`formGrid.js`) takes the divider as a comb boundary, so one field comes back as two or
three pieces, and the narrow trailing piece is square enough to be reported as a checkbox. On the
scored page 3 that is all 50 comb misses and nearly all 179 false positives (comb 24/74, precision
23.5; `corpus/scoring/baselines.json`, FORM-16).

## Acceptance

- ภ.ง.ด.90 comb recall and precision up, no scored form drops, gains re-recorded.
- An element-corpus row pins a comb with a heavier internal divider as one comb.

## 2026-10-01 done

The cause was not a bold divider (the page's ink has none heavier than a wall). Two things broke exact-pitch
chaining in `runsFromTeeth`: the digits are not drawn at one pitch (7.7 to 10.1pt cell to cell, past the 1pt
tolerance) and a ~4.8pt gap for the decimal point precedes the two satang digits, so a field came back as a
narrow lead piece, a body and a 2-cell tail too short to be a comb. `mergeAdjacentRuns` (`formGrid.js`)
joins adjacent runs of one row when the gap is 0.4-1.2 pitches (or zero), their pitches are within 0.7-1.4x,
pitches differ by under 2.5pt, and a short piece is no wider than the run it joins. ภ.ง.ด.90: comb recall 32.4 -> 100 (74/74), form recall
52.4 -> 100, precision 23.5 -> 86.8; the 16 false positives left are all checkbox-kind. No other scored form
moved. Two element-corpus rows pin it: an irregular comb with a narrow decimal gap is one 12-cell comb, and
two combs at one pitch with a doubled gap stay two. Each guard in the merge was added after a measured
regression: the pitch band for form 101's dates and the health phone strip, the gap floor for separately
painted squares, the no-wider rule for the phone strip's label cell, the 2.5pt bound for the redaction sample's postal
code (a 16pt cell beside a 20pt comb: the same 0.8 ratio as ภ.ง.ด.90's 7.7 beside 9.5, only the absolute
difference tells them apart).
