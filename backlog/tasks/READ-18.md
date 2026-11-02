---
id: "READ-18"
title: "Highlight PDF: the phone's note pane stays on the keyboard while the page scrolls"
status: "retired"
priority: "P1"
epic: "highlight-pdf"
depends_on: ["READ-15"]
---

# READ-18 · The note pane rides the keyboard, not the page

**Retired 2026-11-02, replaced by [READ-19](READ-19.md).** The fix below (branch `claude/read-18-pane-keyboard`,
4bf8e92e) was never merged: its window `scroll` listener cannot see the lamp, where the workspace scrolls, and in
pseudo fullscreen a drag on the pane moves `scrollY` itself. READ-19 takes the keyboard out of the pane instead.

*Opened 2026-11-02.* Shlomi, on pdkef.com with an iPhone: writing a note with the keyboard up, "when scrolling
down it was floating up and got mixed up". In the normal view the pane rose to just under the toolbar, with the
page showing between it and the keyboard; in full screen it rose almost off the top of the screen.

## What the pane does today

`NotePane` is `position: fixed; bottom: 0` and lifts itself by `keyboardInset` (`lib/notes/notePane.ts`): the
keyboard's height less how far the visual viewport is panned inside the layout viewport, read as
`visualViewport.pageTop - scrollY` (offsetTop is wrong with the keyboard up, WebKit bug 237851). It recomputes on
the visual viewport's `resize` and `scroll` only.

## Cause (inferred from the code, measured on the phone before closing)

That pan can only lie between 0 and the keyboard's height, but nothing holds it there. A page scroll moves
`scrollY` without a visual viewport event, so the pan reads negative and the pane lifts by that much, and stays
there until the next visual viewport event. Full screen shows the bigger error.

## Fix

- `keyboardInset` holds the pan to the range it can physically take, so the pane never sits higher than the
  keyboard's top.
- The hook also recomputes on the window's `scroll`, one frame later so both values have settled.

## Acceptance

- [ ] Failing unit test first: a pan read negative, or past the keyboard, still puts the pane on the keyboard.
- [ ] On Shlomi's iPhone (LAN dev server), normal view and full screen: the pane stays on the keyboard while the
  page scrolls with a note open for writing.
