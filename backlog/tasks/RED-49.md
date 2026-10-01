---
id: "RED-49"
title: "Check the saved file also reads what no page shows"
status: "open"
priority: "P2"
epic: "redact"
horizon: "next"
order: 3
depends_on: ["RED-48"]
---

# RED-49 · Check the saved file also reads what no page shows

*Filed 2026-10-01 from RED-48.* The saved-file check (RED-17) reads each page's text the way a viewer does,
plus the places outside page text. A deleted run left in an object no page draws (RED-48's old content
stream) is invisible to it, so the check said "not found" while the bytes still held the word.

Add one more pass: decode every stream in the saved file and look for each checked term, in literal and
hex string form. A hit outside any page's text is a finding of its own ("Still in the file, in a part no
page shows"), with Remove it when RED-25's locator can name the object, and none otherwise.

## Acceptance
- On a file built like RED-48's repro before the fix, the check reports the deleted term; after the fix, it does not.
- The pass adds no more than a few hundred ms on the 77-page corpus file.
