---
id: "RED-60"
title: "A place removed from the saved file stays removed on every later Download"
status: "done"
priority: "P1"
epic: "redact"
depends_on: []
---

# RED-60 · A place removed from the saved file stays removed on every later Download

Filed 2026-10-08. The "Remove it does not last" task that RED-59's UX plan sends out of its scope.

## What happens today

Seen on the dev server, 2026-10-08, on a PDF with an attached file: after a Delete export, "Remove it" on
the attachment said `Removed the attachment "original-unredacted.pdf". Saved again and downloaded.` and
that download was clean. Pressing Download again brought the attachment back, and the check's note "This
file has an attached file" returned.

Why: Remove it (`removeFromCheck`, `src/tools/redact/PdfRedactTool.tsx`) rewrites only the saved bytes
(`check/removePlace.ts`) and swaps them in with `EXPORT_SAVED`. Nothing reaches the elements, the history
or the draft, so the next Download, which is `applyPageEdits(sourceFile, elements)` over the original
file, has no way to know. It holds for every removable kind: field value, comment, link, bookmark, title,
author, subject, keywords, XMP, attachment.

RED-59 makes every Download drop the document details, XMP and attachments, which covers those kinds.
Field values, comments, links and bookmarks still need a removal to last, and they are the ones people
remove most.

**The failing guard is in:** `src/tools/redact/e2e/redact-check-remove-sticks.spec.js`. It opens a PDF
with a comment and an attachment, deletes a text run, downloads, removes both from the check (each
removal download is clean), then downloads again. Red on 2026-10-08, chromium: the comment came back,
the attachment came back, and the "attached file" note came back.

## Proposed design

**A removal is part of Redact's work on the document, and every export replays it.**

1. **Where it lives.** A list `removedPlaces: SavedPlace[]` (kind, text, pageIndex when it has one) in
   Redact's state and in its per-document work, saved as `extra.removedPlaces` beside `actionHistory` and
   `carried` (`useEditorDraftPersistence.ts`, validated entry by entry in `draftValidation.ts`'s
   `validateDraftRecord`; a bad entry drops only itself, as `carried` does). Not an element: elements,
   their validator and history entries all require a `pageIndex`, and bookmarks and attachments have
   none. No schema version step, since an old draft simply has no list. It is the document's, like every
   other piece of work: reload or recents bring it back, Download never clears it, Replace clears it with
   the rest of Redact's work.
2. **How an export replays it.** `applyPageEdits` takes one optional `finish(doc)` step, which Redact
   passes and which runs on the output document right before each of its two saves (the end of
   `deleteObjectsFromPdf` and `assemble()` in `redact.js`; the same two points RED-59 puts
   `stripDocumentTraces` in, so they share the seam). Redact's step is a pure
   `removePlaces(doc, places)` in `check/`, built on `placeLocator.ts`'s `locatePlaces`/`isSamePlace`,
   the one reading the check and `removePlace` already use. Matching on the output document, not the
   original, is deliberate: a place is recorded from the saved file, so it is found again the way the
   check found it. A place that is not there any more is skipped quietly (a box now covers its page, a
   Delete already took the link). Two identical places removed twice are two entries, each removing
   one. The hook keeps `src/editor/` free of a Redact import (`docs/module-boundaries.md`), and the
   locator stays single-owner.
3. **What Remove it does.** It records the removal as an edit and then runs the same export Download
   runs, instead of patching the saved bytes. One path means the file Remove it hands over is, by
   construction, the file the next Download makes, and the check re-reads it as it does after any
   Download. `removePlace.ts` then has no caller outside its tests and goes, or shrinks to the
   replay. The cost: on a file with boxes, Remove it re-flattens those pages (seconds on a long scan,
   with the usual progress), where today's byte patch is instant.
4. **Undo.** Recording a removal is a history step, so Undo puts the place back in the next download
   and Redo takes it out again (`editor.md`: Undo covers add, delete and update; a removal would
   otherwise be the one edit that cannot be undone). It is a new `HistoryOperation` with no
   `pageIndex`, which needs `isActionHistoryEntry` widened for that one operation. Like every edit it
   bumps `documentRevision`, which discards the previous saved file and its check
   (`SAVED_EXPORT_DISCARDED`); step 3's export then makes the new one, so the check reappears on the
   new file. No undo chip: the check's own note ("Removed the comment. Saved again and downloaded.")
   is the feedback, and the toolbar's Undo is the way back.
5. **Nothing new in the editing stage.** The removal shows in what it changes, the next file and its
   check, not as a list or a mark on the page (guideline 3, disclose by state; guideline 2, no step that
   exists to show a button). If people later need to see what they removed before downloading, that is
   its own ticket with its own evidence.
6. **Kinds recorded.** Every kind Remove it offers except `unused`, which every export already drops
   (RED-49) and which is not a place in the original. Recording the kinds RED-59 already strips costs
   nothing (the replay finds nothing) and keeps the rule one sentence long.

## Decisions for Shlomi

1. Remove it re-runs the normal export (one path, slower on flattened pages), or keeps patching the
   saved bytes and only records the removal for later downloads (fast now, two paths that must agree).
   Recommended: the normal export.
2. A removal is an Undo/Redo step. Recommended: yes.
3. No editing-stage UI for removed places. Recommended: none.
4. Record every removable kind, or only the four RED-59 does not cover. Recommended: every kind.

## Acceptance

- `redact-check-remove-sticks.spec.js` passes in chromium and webkit, unchanged apart from tightening
  if a decision above asks for it.
- Units, each seen failing first: `removePlaces` removes each kind from an output document and skips a
  missing one; the draft round-trips `removedPlaces` and drops a malformed entry; Remove it records the
  place and runs the export (`PdfRedactTool.test.tsx`, replacing the RED-25 byte-patch test); Undo and
  Redo of a removal change the next export.
- A removal survives a reload: recorded, tab closed, file reopened from recents, Download, still gone.
  A unit over the draft record if it can prove it; otherwise the spec gains one reload step.
- `check:push` green; `test:module-boundaries` shows no new editor-to-tool edge.

## 2026-10-08 built (with RED-59)

Decisions 1 to 4 as recommended. A removal is a `remove-place` history entry (`actionHistory.ts`,
no element, `pageIndex` 0 for a document-level place), derived into `removedPlaces(past)`, saved with
the history, undone and redone like any edit. Every export replays `removePlaces(doc, places)` through
`applyPageEdits`'s `finish` seam on its first pass. Remove it records the entry and runs the normal
export (parked until the revision bump settles, so the invalidation effect cannot retire it). The RED-25
byte patch (`removePlace.ts`) is gone; its tests moved onto `removePlaces`. The guard
`redact-check-remove-sticks.spec.js` is green, tightened for RED-59 (the first download no longer
carries an attachment) and extended with a reload step.
