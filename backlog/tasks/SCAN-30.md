---
id: "SCAN-30"
title: "A 500 KB limit means 500 KB, however a portal counts"
status: "done"
priority: "P1"
epic: "scan-next"
---

# SCAN-30 · A size limit holds however a portal counts

*Opened 2026-11-04* when Shlomi confirmed 500 KB is an official limit for submitting documents. Bituach
Leumi's multi-year report takes 500KB per file.

**The bug.** Scan's 500 KB limit and Compress's 500 KB preset both meant 512,000 bytes. A file could pass
ours and still be over a portal counting 500,000. The real iPhone scan in SCAN-04 showed it: our label said
500 KB where the share sheet said 512 KB for the same file.

**The change.** A KB is 1,000 bytes everywhere a person reads or chooses a size, through `BYTES_PER_KB` and
`kbToBytes` in `src/lib/text/format.js`. A file aimed at 500,000 bytes passes under both ways of counting,
and our labels now read the same as the phone's. Compress's 1 MB preset is 1000.

**Done when:** Scan and Compress targets are decimal, every label agrees with the share sheet, and the
Hebrew guide's numbers are measured at the new target with its 476 tip gone.

**Measured 2026-11-04**, Compress at the 500 KB preset on the COMP-01 scan set, downloaded bytes: 5 pages
493,560, 10 pages 474,636 (was 502,851), 20 pages 488,187. Page one of the 10-page file was read by eye:
readable, a little soft. The Hebrew guide carries these numbers and its 476 tip is gone.

The Scan page's two size-limit pictures lost their byte counts (751 KB and 495 KB were read at 1,024). The
pictures themselves are from the older run; SCAN-31 is what brings the generator back.
