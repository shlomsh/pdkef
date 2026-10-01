---
id: "RED-49"
title: "Check the saved file also reads what no page shows"
status: "done"
priority: "P2"
epic: "redact"
depends_on: ["RED-48"]
---

# RED-49 · Check the saved file also reads what no page shows

*Filed 2026-10-01 from RED-48.* The saved-file check (RED-17) reads each page's text the way a viewer does,
plus the places outside page text. A deleted run left in an object no page draws (RED-48's old content
stream) is invisible to it, so the check said "not found" while the bytes still held the word.

Add one more pass: decode every stream in the saved file and look for each checked term, in literal and
hex string form. A hit outside any page's text is a finding of its own ("Still in the file, in a part no
page shows"), with Remove it when RED-25's locator can name the object, and none otherwise.

**Rescoped 2026-10-01 when started.** After RED-48 our own saves leave no unreferenced part, so this check
would only fire on a regression. The larger gap is the source file: an incremental save can leave old
revisions and orphaned objects behind, and a Delete-only save or Remove it re-saves the file with them.
So two parts, sharing `src/editor/adapters/pdf/reachability.js` (`unreachableRefs`, `dropUnreachable`):

1. Every save that re-writes the source file (Delete-only export, Remove it) drops every object nothing
   reaches from the trailer, not only the ones a rewrite replaced.
2. The check reads the saved file's unreachable parts for each term, and offers Remove it.

## Acceptance
- On a file built like RED-48's repro before the fix, the check reports the deleted term; after the fix, it does not.
- The pass adds no more than a few hundred ms on the 77-page corpus file.

## Result

- `reachability.js`: one walk from the trailer (Root, Info, Encrypt); `unreachableRefs` leaves out object-stream and xref packaging, which pdf-lib rebuilds on save (verified: a cleared title packed in an object stream is gone from the next save). (aad0c94d)
- Export: `dropUnreachable` replaced RED-48's `removeOrphans`, before and after `removeUndrawnImages`, in the Delete export and the Delete preview, so a Delete save carries no leftover from the source file either. (b1bf942d)
- Check: a new place, "In a part of the file no page shows", read from text operators (literal, hex, TJ, split phrases joined and spaced) and string values in unreachable objects; Identity-H glyph ids don't read. Remove it drops them all, and every Remove it drops them before saving. `ParseSpeeds.Fastest` keeps the cost to +5 ms on the 77-page file and about +110 ms on the worst real form (thai-pnd90, which carries 19 KB of readable unused text). (b1a1f63a)
