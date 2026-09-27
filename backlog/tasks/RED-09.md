---
id: "RED-09"
title: "Read-back check after every export: nothing extractable under any box"
status: "open"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: ["RED-12"]
---

# RED-09 · Read-back check after every export: nothing extractable under any box

*Filed 2026-09-27 from RED-01's record, [docs/redact-content-removal.md](../../docs/redact-content-removal.md);
rescoped the same day for RED-12's text layer.*

The text layer is verified, not assumed.

- After export, read the saved file back: no text extractable under any box, and the covered page's
  text is the original's minus the words a box touches.
- It fails closed: a page that fails is saved again as a picture alone, and the done state says so
  plainly ("Page 3 was saved as a picture only, so its text can't be selected"). No security jargon.

## Acceptance

- A deliberately broken text layer (a boxed word written in) is caught, that page is saved again as a
  picture alone, and the person is told.
