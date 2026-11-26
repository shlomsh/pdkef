---
id: "DEBT-80"
title: "Unit tests that fail only when the file's tests run in another order"
status: "done"
priority: "P3"
epic: "honest-tests"
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

## Result (2026-11-26)

Each file was run alone under `--sequence.shuffle --sequence.seed=1..10` before and after, and the seven files
(with QUAL-58's) together under seeds 1 to 3 and in file order: 103 tests, all pass.

- `highlightSwipeGesture`: a mouse swipe's `swallowNextClick` listener stayed armed (it drops on a click or a tick
  after the next mouseup, and the tests are synchronous), so it ate 'a touch swipe arms nothing''s click. The
  afterEach spends it with one click.
- `useEditorDraftPersistence`: 'releases on unmount before the read settles' ended while its restore kept going
  (unmounting does not stop it), so its hand-off, recents and `loadPdf` writes landed in the next test's store. The
  test now waits for that real end.
- `prePickedFiles`: the shared afterEach read a container only `serveInputWith` set; 'takeInputFiles tolerates a
  missing input' run first met it unset. A beforeEach now makes one per test.
- Redact's `DetailsSheet`: 'Delete edits with delete, Undo restores' mounts twice and only the last sheet was
  unmounted, so the first one's Escape listener swallowed Escape in later tests. Every host is unmounted now.
- `PdfImageToPdfTool` (both files): no failing order in seeds 1 to 30, alone or together, so nothing changed. One
  sweep saw seeds 7 and 8 fail once with the output lost; neither failed again in 12 more runs.
