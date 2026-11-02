---
id: "READ-15"
title: "Highlight PDF: notes on a phone and in the lamp are pins in the margin, not a bottom sheet"
status: "in_progress"
priority: "P2"
epic: "highlight-pdf"
horizon: "now"
order: 15
depends_on: []
needs: "Pick a direction: margin pins or a notes column"
---

# READ-15 · Notes on a phone: pins in the margin

*Opened 2026-11-02.* Shlomi: in the lamp on a phone, tapping a highlight pops its comment up as a bottom
sheet. It can't be hidden in any way a person would find (only a thin grab bar closes it), it is not beside
the highlight, and you can never see the comments of several highlights in one view.

The spec already says what a note is: it sits beside its passage, as in Google Docs (R28 in
[READ-01](READ-01.md)), and moves with the page in the same frame (R29). Below 1000 px of workspace,
`useCommentsView.tsx` falls back to Sign's `CommentSheet`, so the phone, in the normal view and in the
lamp, gets none of that.

## What the simulator shows (iPhone 17 Pro, pdkef.com, 2026-11-02)

- Comment opens the sheet with no keyboard: focus comes from an effect, which iOS ignores
  (`docs/sign-next-gen.md` §3).
- With the keyboard up the sheet floats mid-screen, the passage has scrolled out of view, and the site's
  own page text shows through under the sheet in the lamp.
- A saved note stays docked at the bottom with a grab bar as its only close. One note at a time, by design
  of the sheet.
- At Fit width in the lamp the page is about 370 px wide with about 44 px of blank paper either side of
  the text (a typical 1 inch margin); in the normal view the page spans the card.

## Two candidates, checked

| Check | 1. Margin pins | 2. Notes column |
| --- | --- | --- |
| 402 pt phone | Page keeps Fit width; pins sit in the paper's own margin | Fit with a 240 px column puts the page at 0.43, text about 5 px; or the reader pans 240 px sideways for every note |
| R29, same frame | Pins and cards in page space inside the page card, as the rail is today | Already met (the rail is inside the pinched column) |
| Keyboard | The card is under its passage; the board pans both into the space above the keyboard | The card is off to the side; typing means panning there first |
| RTL | Pin in the margin the passage ends in (left for Hebrew), card in the note's own direction | Column on one side for every page |
| "Holding a highlighter" | One small pin per note, nothing else on the page | A second column of chrome on a phone |

**Proposed: 1, margin pins.** Option 2 fails the phone width outright.

## Proposed design (pending Shlomi's pick)

- **A pin per note.** A small note glyph (44 px hit area) in the page's blank margin, level with the
  passage's first line, on the side the passage ends (right for LTR, left for RTL). It lives in page
  percent inside the page card, so it moves with scroll, pinch and zoom in the same frame, and keeps its
  size on screen. No reserved strip: the page keeps its Fit width.
- **Tap the pin, the note opens under its passage**, as wide as the text, in page space. Tap the pin
  again and it hides. Several can be open at once; cards that would overlap stack downward. A tap on a
  card edits it (R60).
- **A new note opens editing under its passage, with the keyboard up.** Comment in the mark panel focuses
  a text field synchronously in the tap (the only focus iOS honours), then the card's field takes over when
  it mounts. The board pans so the passage and the card sit above the keyboard, measured with
  `pageTop - scrollY`, never `visualViewport.offsetTop`. Nothing is `position: fixed`.
- **No bottom sheet in Highlight.** Below the rail width, Highlight gets pins; Sign keeps its sheet
  untouched. The wide rail is unchanged.
- **One guideline sentence.** `docs/ux-design-guidelines.md` §17 says nothing floats over what the person
  is editing on touch. A note card under its passage is the note itself, in page space, not a control
  anchored to an element; §17 gains that one sentence if Shlomi agrees.
- **Later, not here:** R28's "zoomed past the fit" pins on a wide screen can reuse the same pin layer.

## Steps (after the pick)

1. Pure layout in `src/tools/highlight/lib/notes/`: `pinPlacement` (bands, direction, text margins to
   pin position in page percent), `openCardLayout` (open notes to stacked tops, reusing `stackCards`),
   `keyboardPan` (passage and card rects, visible height to a board scroll). Failing unit tests first,
   including a three-line RTL passage and a page with no blank margin.
2. Open-notes state: a set of open note ids beside `activeElementId`, with Esc closing one layer.
3. `NotePins` inside the Highlight page card, thin over (1); `useCommentsView` gains a narrow mode that
   returns pins instead of the sheet for Highlight only.
4. The synchronous focus hand-off for a new note, and the keyboard pan.
5. One e2e for what jsdom cannot prove: a pin and an open card stay on their passage through a lamp
   pinch, and the card sits above a simulated keyboard.
6. Verify on the iPhone simulator with a screenshot, normal view and lamp, English and Hebrew.

## Acceptance

- [ ] Shlomi picks a direction.
- [ ] On a 402 pt phone, normal view and lamp: every saved note shows a pin beside its passage, a tap
  opens and a second tap hides its card, and two notes can be open together.
- [ ] Pins and open cards stay on their passages through scroll, pinch and zoom (R29).
- [ ] A new note opens with the keyboard up and the passage and card in view above it.
- [ ] Hebrew passages get their pin in the left margin.
- [ ] No bottom sheet in Highlight; Sign and the desktop rail unchanged.
- [ ] Checked on the iPhone simulator with screenshots.
