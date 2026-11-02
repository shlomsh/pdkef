---
id: "READ-19"
title: "Highlight PDF: reading and writing notes on a phone, rethought as a whole"
status: "in_progress"
priority: "P1"
epic: "highlight-pdf"
horizon: "now"
order: 19
depends_on: ["READ-15", "READ-17"]
needs: "Your pick of a model, then a check on your iPhone"
---

# READ-19 · Notes on a phone, as a whole

*Opened 2026-11-02.* After three fixes in a row to the phone's note pane (READ-15 built it, READ-17 rebuilt its
card, READ-18 chased the pane floating off the keyboard), Shlomi: stop patching, stabilise, and look at mobile
comment reading as a whole. Described here before anything is built. This ticket replaces READ-18 (its fix stays
unmerged on `claude/read-18-pane-keyboard`) and READ-17's open phone acceptance line.

## Measured (2026-11-02, Playwright WebKit with touch, 402x874, main at 900b81b1)

Dev server, three notes on page 1 (short, short, 14 lines) and a fourth on a lower mark. Both full screen modes
were run: real element fullscreen, and pseudo (requestFullscreen removed, as on iPhone Safari). Script and 45
screenshots: the session scratchpad's `pane-audit/` (not kept in the repo).

| State | Pane top / height | Screen covered | The passage |
| --- | --- | --- | --- |
| Short note open | 679 / 195 | 22% | 367 px above the pane |
| 14-line note open | 476 / 398 | 46% | 32 px above the pane |
| 31-line note open | 463 / 411 | 47% (card capped at 40vh, scrolls inside) | 20 px above the pane |
| Editing, keyboard down | 626 / 248 | 28% | |
| Editing, a 380 px keyboard up (computed) | 246 / 248 | | hidden under the pane by 65 to 198 px in the normal view; clear by 56 px in the lamp |

- **Page left to see while writing:** 151 px in the normal view once the tool card is stuck (36 px at scroll 0),
  166 px in the lamp. That is about a sixth of the screen, and the passage is usually not in it.
- **Opening a note scrolls its passage to the viewport's centre (437 px)**, whatever the pane's height, so below a
  tall card it lands 20 to 32 px above the pane, and under it once the keyboard is up.
- **Focus:** Comment focuses the field 13 to 17 ms after the tap, outside the gesture, so iOS raises no keyboard
  (READ-15's Simulator saw exactly this). Edit focuses 11 to 16 ms after its tap, the same effect-driven timing;
  the instrument read it as inside the gesture only because the pane stops click propagation, so treat it as the
  same problem until a phone says otherwise.
- **Switching:** the arrows, a swipe and a tap on another mark all switch and bring the passage above the pane
  (about 250 ms). The arrow while editing saves the draft silently, closes the field and leaves focus on a
  `div` outside the pane.
- **Closing:** Close works everywhere; Escape closes in the normal view. A tap on blank page or the gutter does
  not close the pane, in any view. In real fullscreen, Escape leaves the lamp and keeps the pane; in pseudo it
  closes the pane and keeps the lamp.
- **Lamp scrolling:** only the fixed workspace scrolls (scrollTop moves, `window.scrollY` never does, no window
  `scroll` event). But a wheel over the pane's header in pseudo mode scrolls the hidden document behind the lamp
  (`scrollY` 0 to 120): the pane's own gestures move the very number the keyboard math reads.

Not measurable here: a real touch swipe (imitated with `scrollLeft`) and the real iOS keyboard. Both need the
phone.

## What is fragile

1. **The pane is held on the keyboard by script, which iOS does not support.** `keyboardInset` reads
   `visualViewport` and `scrollY`, recomputed on visual viewport events only. A page scroll sends none, so the
   pane lifts (READ-18, Shlomi's report). READ-18's clamp is right as far as it goes, but its window `scroll`
   listener never fires in the lamp, where the workspace scrolls instead, and in pseudo fullscreen a drag on the
   pane scrolls the hidden document and moves `scrollY` anyway. Sign paid for this lesson already: on touch, a
   fixed bar of ours hides while typing (`docs/sign-next-gen-guidelines.md` §2.6, §11 item 7). The pane breaks
   that rule.
2. **Writing has no room even when the math is right.** Keyboard plus pane plus toolbar leave about 150 px of
   page, and the passage is under the pane. The pane shows the note you are typing and hides the passage it is
   about.
3. **The keyboard does not come up for a new note, and probably not for Edit.** Both focus from an effect after
   the tap (`docs/sign-next-gen.md` §3, MOBI-24). WebKit in Playwright does not enforce this, so every e2e is
   green.
4. **Three scrollers stacked**: the page (window, or the workspace in the lamp), the sideways track, and a long
   card's own vertical scroll. Scroll chaining between them is what moved `scrollY` above.
5. **The passage is centred, not placed.** `scrollIntoView({ block: 'center' })` ignores the pane's height and
   the keyboard, so the passage lands just above a tall card and behind the pane while typing.
6. **Small inconsistencies that add up:** a tap on the page does not close the pane; Escape means different
   things in the two fullscreen modes; switching notes while typing saves silently and drops focus.

Items 1 to 3 are structural: no patch to the current pane removes them, because they come from a text field
living in a bar pinned to the bottom of a web page on iOS.

## How phone readers do it (from general knowledge, not measured here)

Book readers and document apps on phones split the two jobs: reading a note is a light peek (a popover or a
short sheet, with no keyboard), and writing one opens a full screen or nearly full screen editor with the field
near the top. A native app can pin a bar to the keyboard because iOS gives it the keyboard's frame; a web page
gets only `visualViewport`, and Safari has none of Chromium's fixes (`interactive-widget`, the VirtualKeyboard
API).

## Three models (pitches, nothing sketched yet; sketch only the pick)

Each answers the same question: where does a note live on a 402px screen, and where does the keyboard meet it.
The rule they all keep, from Sign's own lesson (`docs/sign-next-gen-guidelines.md` §2.6, §11 item 7): **nothing
of ours is held above the keyboard by script.** iOS already keeps a focused field in view; we stop fighting it.

### A. A slip under the passage (no pane)

Tap a highlight with a note and the note unfolds right under the passage, on the page itself, like a slip of
paper tucked under the line. It scrolls with the page because it is part of the page. Reading the next note is
just reading on: scroll, and tap the next marked passage. Writing happens in the same slip, and since it sits
in the page's own scroll, iOS lifts it above the keyboard by itself. A tap anywhere else on the page folds it
away. It is the phone's version of the desktop rail's promise (the note sits beside its passage and moves with
the page in the same frame, R28/R29), turned 90 degrees.

- Goes away: the pane, the sideways track, the arrows and count, the keyboard math, two of three scrollers.
- Stays: the ... menu, the four-line fold, Delete with an Undo chip.
- Costs: while open it covers the lines under its passage (one slip at a time; near a page's foot it opens
  above the passage instead). Its type keeps its own size at any zoom. No "next note" without scrolling.

### B. A note page of its own

Tap a highlight with a note and the note opens full screen, the way a phone's book reader opens a note: at
the top, a picture of the passage cut from the page's own rendering (so a scan works too), and the note under
it. Tap the text to write; the field sits near the top, so the keyboard never reaches it. Swipe sideways for the
next note in reading order; Close returns to the same place on the page.

- Goes away: everything fixed over the page while reading, the keyboard math, the scroll-into-view guess.
- Stays: the swipe between notes, the ... menu, Delete with Undo.
- Costs: the note and the page are never on screen together; reading a note means leaving the page for a
  moment. The passage picture is new work (a crop of the canvas we already draw).

### C. The pane reads, a sheet writes

Keep READ-15's pane exactly as built for reading: one note at a time, sideways swipe, the ... menu. It just
never carries the keyboard. Edit, or Comment on a new highlight, opens B's writing page; Save or Cancel brings
you back to the pane where you were.

- Goes away: the keyboard math and the pane's riding the keyboard.
- Stays: everything Shlomi has already seen of the pane.
- Costs: two surfaces for one note. The pane still covers the bottom of the screen while reading (22 to 47%),
  and the passage must be placed above the pane rather than centred (fragile item 5).

### Lead's read

C first: it is the common pattern, it keeps everything Shlomi has seen of the pane, and it removes the three
structural problems (no field in the pane, so no keyboard math, and the writing page opens and focuses its
field inside the tap). B is the same writing page with reading moved there too. A is the most like holding a
highlighter but the least proven on phones. Whichever is picked, the writing surface is opened and focused
synchronously in the tap, from an element that already exists.

A step-by-step storyboard of today's problem and of A, B and C was shown in the session on 2026-11-02.

## Picked: C (2026-11-02)

Shlomi picked C: the pane reads, a page of its own writes.

## Contract

- `NoteTarget = { id, comment, isNew }` (`lib/notes/noteWriter.ts`): the comment the writing page is open on.
- `markCommands.comment(mark)` returns the `NoteTarget` it made active (a blank, unlogged comment when the mark had
  none, as today).
- `useNoteWriter()` returns `{ dialog, field, target, open(target), close() }`. `open` runs inside the tap and is
  synchronous: it fills the field, `showModal()`s the dialog and focuses the field before it returns, so iOS raises
  the keyboard. The dialog is always mounted under a narrow workspace, so the field already exists.
- `NoteWriter` is that dialog, full screen in the top layer (so it shows in real and pseudo fullscreen): Cancel, a
  title, Save (Comment for a new note) in a header; a `passage` slot; the field (16 px, `dir="auto"`). Escape and
  Cancel discard a new note and leave an old one as it was; Save writes one undo step through the card actions.
  Pure decisions (save, discard, nothing) live in `lib/notes/noteWriter.ts`.
- `PassagePicture({ elements, noteId })`: a crop of the passage's page canvas with the mark's bands painted in its
  colour. Geometry is the pure `lib/notes/passageCrop.ts`.
- `CommentCardBody` takes an optional `onEdit`. With it, Edit calls `onEdit` inside the click and the card never
  opens a field of its own. The desktop rail and Sign pass nothing and keep editing in place.
- `NotePane` takes `onEdit(id)`, has no keyboard code (`keyboardInset` and its hook are deleted), and places the
  passage in the middle of the band above the pane: `scroll-margin-bottom` = the pane's height, then
  `scrollIntoView({ block: 'center' })`.
- `HighlightWorkspace` wires them: on a narrow workspace, Comment and Edit open the writer.

Not in C, kept as they are: a tap on the page does not close the pane; Escape's two fullscreen meanings.

## Acceptance

- [ ] Failing tests first, each seen red: the writer opens and focuses synchronously; `onEdit` replaces the card's
  own field; `comment` returns its target; the crop geometry; the pane has no keyboard offset.
- [ ] WebKit e2e at 402x874 with touch: Comment and Edit open the writer with its field focused and the pane has
  no field; Save and Cancel do what they say; a long note's passage sits above the pane; the writer covers the
  screen in the lamp.
- [ ] Fresh-context review, findings fixed test first.
- [ ] On Shlomi's iPhone (LAN dev server), normal view and lamp: Comment and Edit raise the keyboard; the field
  stays in view while typing and while the page behind is scrolled; nothing drifts.
- [x] READ-18 retired as replaced by this ticket; READ-17's phone line moved here and READ-17 closed.
