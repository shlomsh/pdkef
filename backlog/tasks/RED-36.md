---
id: "RED-36"
title: "Redact finishes like Merge: progress where you pressed, a done line with what was saved, then Compress it · Sign it"
status: "done"
priority: "P1"
epic: "redact-tool"
depends_on: []
---

# RED-36 · Redact finishes like Merge: progress where you pressed, a done line with what was saved, then Compress it · Sign it

*UX review 2026-09-29, guideline §2 and §13.* After Download nothing visible changed: the done message
was screen-reader only, progress rendered below the last page, and Compress appeared as an icon in the
toolbar.

- Progress shows in the toolbar's status slot and on the completion Download, not below the pages.
- Done: "Saved redacted_x.pdf · 2 pages" plus what the pages are ("pages with a box are saved as
  pictures; the rest keep their text"), in the status slot and above the saved-file check.
- Next steps under Download: Share (where it exists), Compress it, Sign it.
- Before the first box, Download's place holds a sentence, not a greyed button with a tooltip.
- An edit that cancels an export says so where it is seen.
- The output name never chains: `redacted_redacted_x.pdf` stays `redacted_x.pdf`.

## Acceptance

- After Download the status slot shows the saved name and page count; Compress it and Sign it hand the
  file off.
- A second export of an already redacted file keeps a single `redacted_` prefix.

## Result (2026-09-29)

RedactFinish.tsx + finishState.ts (pure wording): count, Download with progress in place, 'Saved x · N pages', what the pages are, Compress it · Sign it; the status line says the same; redactedFileName never chains; an edit that stops an export says so.
