---
id: "RED-19"
title: "True redaction, text: delete the glyphs under each box and keep every other glyph as it was"
status: "open"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: ["RED-18"]
---

# RED-19 · True redaction, text: delete the glyphs under each box and keep every other glyph as it was

*Built only if RED-18 meets its bar. Design: RED-18's Text bullet and
[docs/redact-content-removal.md](../../docs/redact-content-removal.md).*

Covered glyphs, visible or invisible, are deleted from the content stream. Survivors keep their original
codes, order and position. A glyph cut by a box edge is deleted and its visible part kept as a tiny
picture; a box that only grazes a neighbour leaves it (the glyph-core rule). A page whose operations don't
line up with the raw stream falls back to a picture.

## Acceptance

- "Quarterly Report 2025" with "2025" covered: the saved file's text is "Quarterly Report", in its
  original font, and the page looks exactly as it did on screen.
- A Hebrew line with its middle word covered keeps both neighbours whole and in order.
- The three real forms pass RED-18's checks with no fallback.
