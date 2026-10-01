---
id: "RED-04"
title: "What you see is what you save: the editor shows the page as it will export"
status: "retired"
priority: "P2"
epic: "redact-tool"
depends_on: ["RED-07"]
---

# RED-04 · What you see is what you save: the editor shows the page as it will export

**Retired 2026-09-27** in favour of RED-12: the as-saved view existed to show what removal would change. With RED-12 a covered page looks exactly as today's boxes show it, so there is nothing new to preview. Shlomi's review of the epic found the engine path cost more than the one problem it solved (text on covered pages can't be selected or searched). The PDFium measurements stay in [docs/redact-content-removal.md](../../docs/redact-content-removal.md) if vector fidelity or file size is ever asked for.

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

## From RED-01's record (2026-09-27)

Ships with the removal (RED-07), only in Keep the text mode (RED-06). The as-saved page is drawn in the
engine's worker after edits settle. Measure a render budget on a slow phone first; a document whose
pages exceed it steps down to a "Show as saved" button, and the person is told. Quick mode keeps
today's view.
