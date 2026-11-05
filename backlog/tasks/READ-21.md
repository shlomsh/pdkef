---
id: "READ-21"
title: "Opening a note's menu flips the note's direction"
status: "done"
priority: "P1"
epic: "highlight-pdf"
depends_on: []
---

# READ-21 · A note keeps its direction when its menu opens

*Filed 2026-11-05 from Shlomi's screenshots of a Hebrew note on pdkef.com/highlight-pdf/.*

The Edit / Delete menu rendered inside the note's `dir="auto"` paragraph. Its words come first in the
paragraph, so they decided the direction: in an English interface a Hebrew note turned left-to-right the
moment the menu opened, its text reordered and the ... button jumped to the other side of the card.

## Outcome

Opening the menu changes nothing about the note: same direction, same text order, the ... button stays
at the note's end. The menu carries the interface direction and sits on the card, whichever way the note runs. This
holds on the desktop rail, the phone pane and Sign's comments, which all share `CommentCardBody`.
