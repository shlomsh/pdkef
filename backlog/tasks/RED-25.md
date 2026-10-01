---
id: "RED-25"
title: "Check the saved file: Remove it, for a secret in a place a box can't reach"
status: "done"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: ["RED-17"]
---

# RED-25 · Check the saved file: Remove it, for a secret in a place a box can't reach

*Split from RED-17 on 2026-09-28 so it could close: the check reports a term found in the document's
title, author, subject, keywords, XMP details, a bookmark or an attachment's name, but offers no action
there yet.*

Next to such a finding, **Remove it** clears that one place from the saved file and saves it again: the
Info field, the XMP value, the bookmark (its title, or the whole entry), or the attachment. The check then
runs on the new file.

## Acceptance

- A term in the title: Remove it, and the new saved file's title no longer holds it; nothing else in the
  file changes.
- A bookmark and an attachment, the same way.
- The done state says what was removed, plainly.

## Result

`check/removePlace.ts` removes exactly one place, found by `placeLocator.ts`, which shares its text rules (`placeText.ts`) with `readSavedFile`, so the two never disagree; a test reads one file both ways. Info keys, XMP, bookmarks (relinked, counts fixed), attachments (name tree pruned), fields (value and appearance), comments and links. Removed objects leave the file, not just the tree. In the check, a removable finding has Remove it: the file is saved again under the same name, downloaded, and checked again, and the panel says what went ("Removed the bookmark \"…\". Saved again and downloaded."). A field's name is reported, without Remove. (d2fa619f, 7143e670, 85c835b9)
