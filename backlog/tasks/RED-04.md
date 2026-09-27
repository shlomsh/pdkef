---
id: "RED-04"
title: "What you see is what you save: the editor shows the page as it will export"
status: "open"
priority: "P2"
epic: "redact-tool"
phase: "longer-term"
depends_on: ["RED-01"]
---

# RED-04 · What you see is what you save: the editor shows the page as it will export

*Filed 2026-09-27 from SITE-41's follow-ups (merges "show that it's gone" and "what they'll see").*

The editor shows each page exactly as the export will be: a deleted element disappears while you
edit, and a covered area shows its final look. Shlomi's framing: the same goal as a Compress-style
preview, done better by making the editor itself WYSIWYG.

It depends on RED-01: once removal really takes content out of the file, the preview can be the
real output rendered back. Risks to measure first: re-rendering cost per edit on large pages, and
keeping edits undoable while the displayed page is derived output. A fallback is a Compress-style
before/after preview of the export, with an on-device check that no text is extractable under any
box.

## Acceptance

- Deleting a text run or image removes it from the displayed page immediately, and the downloaded
  file matches what was shown.
