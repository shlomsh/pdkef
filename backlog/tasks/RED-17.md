---
id: "RED-17"
title: "Check the saved file: search it for what you covered, everywhere a secret can hide"
status: "in_progress"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-17 · Check the saved file: search it for what you covered, everywhere a secret can hide

*Planned with Shlomi 2026-09-28. Ships first: it helps with today's export and doesn't wait for true
redaction (RED-18 onward). Plan: [docs/redact-content-removal.md](../../docs/redact-content-removal.md).*

After Download or Share, Redact's done state offers **Check the saved file**. It reloads the bytes that
were saved, not the editor's model, and searches them.

## What it searches for

- The text that was under each box, read from the original.
- Every Find term and preset (email, phone, ID number) used on this document.
- Anything the person types. Matching is Find's (`foldForSearch`), so spaced or hyphenated digits match.

Checking what was covered runs on its own; the rest runs when asked. Very short covered words ("the")
raise false alarms, so the build measures a minimum length on the real forms before choosing it.

## How a match is followed

Each match is found in the **original**, where the text is still readable, and followed to the saved file:

- under a box: removed;
- on a page that kept its text: it must be findable in the saved file, and is reported where it is;
- on a page that became a picture, with no box on it: **still visible**, reported as "Found on page 4.
  It's still visible in the picture there." A page falling back to a picture never hides a match.

Also searched in the saved file: page text including invisible text (a scan's OCR layer), form field
values, comments and other annotation text, bookmarks, the document's title, author, subject and
keywords (Info and XMP), and attachments (at least their names, and a plain line that the file has
some).

## What it proves about the boxes

Each saved page with a Blackout or Whiteout is drawn, and every such area must be one flat colour, so the
covered pixels are gone whatever happened to the text. Blur boxes are not second-guessed: the default
strength is medium (RED-24), and a person who picks light chose it knowingly (Shlomi, 2026-09-28).

## Actions

- **Cover it**: back to the editor with that match boxed (Find's existing path).
- **Remove it**: for places a box can't reach (a metadata field, a bookmark, an attachment).

## What it never says (Shlomi, 2026-09-28)

It never reports absence. "I searched and didn't find it" is not "it isn't there": text inside pictures
(scans, pages saved as pictures, images a box touched) can't be searched. The result says what was found
and where, names the pages that are pictures so the person can look at them, and always carries one plain
line: it reads text only, and the person decides the file is safe to share. No "all clear", no green
tick, no "clean".

OCR is out of scope.

## Acceptance

- On the three real forms: a covered name that also appears uncovered on another page is reported with
  its page, both when that page kept its text and when it was saved as a picture.
- A term in the title, a bookmark or a form field value is reported with where it is, and Remove it
  clears it from the saved file.
- A Blackout area that is not one flat colour in the saved render is reported (a unit test with a
  sabotaged render).
- Copy review: no string in the result claims a term is absent from the file.
