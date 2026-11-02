---
id: "READ-16"
title: "Highlight PDF: jump to the first note, and next and previous, on desktop"
status: "open"
priority: "P3"
epic: "highlight-pdf"
horizon: "later"
order: 16
depends_on: ["READ-15"]
needs: "Pick the stepper's place: the toolbar capsule, the top of the rail, or the page header"
---

# READ-16 · Next and previous note on desktop

*Opened 2026-11-02, split from [READ-15](READ-15.md) and parked the same day at Shlomi's call.* On desktop,
a document whose first comment is on page 3 was confusing: there is no way to jump to the first comment, only
scrolling to find it, and next and previous would help.

The phone pane's reading-order list (`paneNotes` in `src/tools/highlight/lib/notes/notePane.ts`) drives this
too: a "1 of 4" stepper that selects a note and scrolls its passage and card into view.

## Places offered (not picked)

- **The toolbar capsule**, beside the page count: always in view, one place for the whole document, and it
  works before the rail shows.
- **The top of the rail**, a sticky row: close to the cards, but there is no rail on a page before the first
  note.
- **The page header**, where "2 comments" sits: local to a page, so it cannot jump across pages.

## Acceptance

- [ ] Shlomi picks the place.
- [ ] From page 1 of a document whose first note is on page 3, one press opens that note with its passage in
  view.
- [ ] Next and previous walk every note in reading order, across pages.
