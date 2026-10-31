---
id: "SIGN-44"
title: "Sign: a comment on a highlight, kept in the PDF as a standard annotation"
status: "done"
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
  note field under the last band. The text commits once, on blur, as one undo step; emptying it removes
  the comment.
- **The number.** A commented highlight shows a small numbered circle where its passage starts (the right
  end of the first band on RTL text). Numbers follow reading order (`commentNumbers` in
  `src/tools/sign/lib/highlight/commentNumbers.ts`), the same on screen and in the file.
- **The export.** Every highlight is a standard `/Highlight` annotation (QuadPoints in user space, an
  appearance stream with Multiply blending, printable), not a drawn rectangle. A comment rides in its
  `/Contents` with a `/Popup`; a `/FreeText` number badge sits beside it, grouped to the highlight.
- **The comments page.** When any highlight has a comment, the export appends a page titled Comments
  listing each one: its number, page, a clip of the highlighted passage taken from the page itself (works
  on scans), and the comment. Each entry links back to its passage.

## Acceptance

- [x] `commentNumbers` is pure and unit-tested.
- [x] Comment button, note field and number badge work with a mouse and on a phone, in Hebrew and English.
- [x] A comment survives a draft restore, undo and redo.
- [x] The exported PDF carries `/Highlight` annotations with `/Contents`, readable back in a unit test, and
  shows them in another viewer (pdf.js and Poppler) and when printed.
- [x] The comments page lists each comment in number order with a clip of its passage, in the comment's
  script, and links back.

## Done 2026-10-31

A highlight takes a comment: the Comment button opens a note under the band, a number badge marks it, and the export carries a standard `/Highlight` annotation with `/Contents` and a Popup, plus a comments page with each passage clipped. e2e `sign-highlight-comments.spec.js` (reload, undo, redo, export read back with pdf-lib) passes in Chromium and desktop WebKit. Checked at 390px with touch in Hebrew: a swipe makes one band, Comment opens a focused note, the badge shows 1. The note and badge colors come from tokens.
