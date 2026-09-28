---
id: "RED-25"
title: "Check the saved file: Remove it, for a secret in a place a box can't reach"
status: "open"
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
