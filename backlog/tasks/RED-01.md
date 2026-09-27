---
id: "RED-01"
title: "Spike: remove the text and images under a box instead of flattening the page"
status: "in_progress"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-01 · Spike: remove the text and images under a box instead of flattening the page

*Filed 2026-09-27 from SITE-41's follow-ups.*

Today a page with any Blur, Blackout or Whiteout box is exported as one JPEG (`src/editor/adapters/pdf/redact.js`),
so the whole page loses selectable, searchable text, not just the covered part. The better result
removes only the glyphs and image pixels under each box and keeps the rest of the page as it was.
Sign should use the same engine (its Whiteout covers content that stays in the file).

This ticket is the research spike, not the build. On a corpus of real PDFs, measure what content
removal has to handle before committing:

- text split across several `TJ`/`Tj` operators, kerning arrays, partial words under a box edge
- fonts with custom or missing encodings, and Hebrew/Arabic shaping (glyph order vs reading order)
- form XObjects, inline and partly covered images, vector paths, annotations drawn over the box
- the cost of re-writing content streams on a 77-page draft
- a check that nothing under a box can be extracted afterwards (pdf.js text + image extraction)

## Acceptance

- A short record in `docs/` naming what works, what falls back to flattening (and how the person
  is told), and a go / no-go with the build split into tickets.
