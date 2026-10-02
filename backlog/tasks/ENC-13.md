---
id: "ENC-13"
title: "Merge puts the unlocked file back in its slot"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "next"
order: 9
depends_on: ["ENC-04", "ENC-12"]
---

# ENC-13 · Merge puts the unlocked file back in its slot

*Plan section 4, open decision 4.* Merge has no hand-off receiver, and the one it needs is not like the others: the set is already open (its draft keeps the other files), so the returned file must be inserted at the position the protected file held, not opened as a new document.

## Brief
- A receiver for the Merge key (ENC-02 map) that reads the hand-off and `?unlocked=1`, replaces the protected entry, and leaves the draft's other files and order alone.

## Acceptance
- Unit: the file lands in the same slot; a hand-off arriving when no protected entry exists is added at the end. A round trip from the card keeps the set intact.
