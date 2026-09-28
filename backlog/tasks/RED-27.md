---
id: "RED-27"
title: "Delete leaves nothing hidden behind: the link over what it removes, and the file's details"
status: "done"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-27 · Delete leaves nothing hidden behind: the link over what it removes, and the file's details

*Found 2026-09-28 on a real CamScanner scan (SEO-38).* The footer is its own image (80x30 pt, bottom
right) with a Link annotation on exactly the same rectangle, pointing at camscanner.com. Delete removed
the image and kept the link, so the saved file's blank corner still opened the site. The file's Info also
kept the title and author "CamScanner", the phone's OS build and the exact scan time. A page saved as a
picture already drops all of this (it is a new page in a new document); Delete kept it because it edits
the original document in place.

Shlomi: "I am now worried there are invisible elements which I do not even see that I want to delete."

## Scope

1. **Delete takes the link lying over what it removes.** When a deleted object's box covers most of a
   Link annotation's rectangle, the link goes too. Pure geometry in its own module; only `/Link`, never a
   form field or a comment.
2. **A Delete download carries no file details from the original**, the same as a picture page already
   does: Info title, author, subject, keywords, creator, producer, dates, and the catalog's XMP
   `/Metadata`.
3. **The saved-file check lists links.** A term found in a link's address is reported like a comment or
   a form field ("In a link on page 2."), so a hidden address is findable.

Bookmarks and attachments stay with RED-25 (the person chooses, per item).

## Acceptance

- Unit tests for each of the three; the CamScanner-shaped fixture's Delete case has no link and no
  "camscanner" anywhere in the saved bytes.
- The real scan (kept off the repo) re-checked by hand: no link, no CamScanner, no device or time.

## Done, 2026-09-28

The real scan, after Delete on the footer: 1 image (the scan), 0 links, no Title, Author, Producer or
CreationDate, and no object anywhere in the file mentions CamScanner (before: 2 images, 1 link, 2
mentions, all four details). Review follow-ups folded in: the old indirect `/Annots` array is deleted
too, and a test pins that a link over a deleted text run goes with it.
