---
id: "DEBT-80"
title: "Unit tests that fail only when the file's tests run in another order"
status: "open"
priority: "P3"
epic: "honest-tests"
horizon: "later"
depends_on: []
---

# DEBT-80 · Unit tests that fail only in another order

*Filed 2026-11-26, from LAND-04's open list.* Run with `--sequence.shuffle`, a few files fail under some seeds and
pass in file order, so a test leans on state an earlier one left: `prePickedFiles`, `PdfImageToPdfTool`, Redact's
`DetailsSheet`, `highlightSwipeGesture` ('a touch swipe arms nothing', seeds 1 to 3) and `useEditorDraftPersistence`
(seeds 1 and 2). They failed the same way before LAND-04's waves.

## Outcome

Each of these files passes under `--sequence.shuffle --sequence.seed=1,2,3`, each fix starting from the seed that
failed, and the leaked state named in the commit.
