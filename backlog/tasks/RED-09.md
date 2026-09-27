---
id: "RED-09"
title: "Read-back check after every export, and a done state that tells the person per page"
status: "open"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: ["RED-07"]
---

# RED-09 · Read-back check after every export, and a done state that tells the person per page

*Filed 2026-09-27 from RED-01's record, [docs/redact-content-removal.md](../../docs/redact-content-removal.md).*

Removal is verified, not assumed.

- After export, read the file back: nothing extractable under any box (text, image pixels, annotation
  text), and all text outside the boxes unchanged from the original. A page that fails is re-exported
  flattened.
- The done state names, in plain words, which pages kept their text and which were saved as a
  picture, and why. No security jargon.

## Acceptance

- A deliberately broken engine result is caught and that page flattened, with the person told.
