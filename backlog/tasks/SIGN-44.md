---
id: "SIGN-44"
title: "Sign: a comment on a highlight, kept in the PDF as a standard annotation"
status: "in_progress"
horizon: "now"
priority: "P2"
epic: "polish"
depends_on: ["SIGN-46"]
---

# SIGN-44 · A comment on a highlight, kept in the PDF as a standard annotation

*Filed 2026-10-31.* Shlomi: a student reading a paper highlights passages and writes comments as they
read. He picked option B from the comments exploration: the comments live in the PDF itself as standard
annotations, so any viewer shows them and they print, plus a numbered comments page at the end.

## Design

- **Writing a comment.** A selected highlight's toolbar has a Comment button after the colors. It opens a
  card; the card's Comment button saves the text as one undo step, Cancel drops a new one. A card shows the
  comment alone, in the Google Docs manner: no author, date or passage excerpt on screen. Its ⋮ menu has
  Edit and Delete. Selecting a card focuses its passage (a deeper tint, scrolled into view); hovering one
  lightens it.
- **Where cards sit.** On a wide workspace (pages container at least 1000px) cards stand in a margin rail
  beside the page, each lined up with its passage and stacked so none overlap; the rail is reserved once
  Highlight is armed, so the page never narrows under a swipe. Narrower, the selected comment opens in a
  bottom sheet. A commented passage ends in a small dot, and the page header reads "N comments" next to
  Clear page.
- **The date.** Every saved edit stamps `commentedAt`; the export writes it as the annotation's `/M`. It is
  metadata only, never shown on a card (Shlomi, 2026-10-31).
- **The export.** Every highlight is a standard `/Highlight` annotation (QuadPoints in user space, an
  appearance stream with Multiply blending, printable), not a drawn rectangle. A comment rides in its
  `/Contents` with a `/Popup`; a `/FreeText` number badge sits beside it, grouped to the highlight.
- **The comments page.** When any highlight has a comment, the export appends a page titled Comments
  listing each one: its number, page, a clip of the highlighted passage taken from the page itself (works
  on scans), and the comment. Each entry links back to its passage.

## Acceptance

- [x] Comment cards in a margin rail on a wide screen and a bottom sheet on a phone, a dot at each passage's
  end and the count in the page header, in Hebrew and English.
- [x] A card shows the comment alone; Edit and Delete in its ⋮ menu; selecting it focuses the passage.
- [x] A comment survives a draft restore, undo and redo.
- [x] The exported PDF carries `/Highlight` annotations with `/Contents` and `/M`, readable back in a unit
  test, and shows them in another viewer (pdf.js and Poppler) and when printed.
- [x] The comments page lists each comment in number order with a clip of its passage, in the comment's
  script, and links back.
- [ ] A note pin: a comment anchored to a point on the page, with no highlight.
- ~~"Print my comments" at download: the comments page on its own.~~ Moved out of Sign on 2026-11-01:
  printing with notes is [READ-06](READ-06.md), in Highlight PDF only.
- [ ] Opening a PDF that already carries `/Highlight` annotations with `/Contents` brings them back as
  editable highlights and comments; a unit round trip proves export then import is lossless.

## Progress 2026-10-31

The rail, sheet, dot, header count and Docs-style cards are built; e2e `sign-highlight-comments.spec.js`
covers the rail flow, reload, undo, redo and the export read back with pdf-lib. The three open items above
are what remains of option B.
