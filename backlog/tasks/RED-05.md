---
id: "RED-05"
title: "Spike: Hebrew and Arabic survivors of a partial rebuild keep their glyphs and order"
status: "open"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-05 · Spike: Hebrew and Arabic survivors of a partial rebuild keep their glyphs and order

*Filed 2026-09-27 from RED-01's record, [docs/redact-content-removal.md](../../docs/redact-content-removal.md).*

RED-01 found that when PDFium rebuilds a Hebrew run around a removed word, the surviving words come
back in the wrong order and 1-2 letters short (`spikes/red-01/results-summary.md`, `mid-run-hebrew.pdf`).
The rebuild re-encodes text with `FPDFText_SetText`, which is the likely cause.

- Try re-emitting the survivors' original glyph codes (`FPDFText_SetCharcodes`) with their original
  per-glyph positions, so nothing is re-shaped or re-ordered.
- Add real Hebrew and Arabic fixtures made by a real authoring tool (logical order), not only the
  spike's visual-order trick, including niqqud and a mixed Hebrew/number line.
- Check the rendered page as well as the extracted text: the damage may or may not be visible.

## Acceptance

- Every RTL fixture passes the RED-01 checker, or the record names the cases that must fall back to
  flattening that page, and RED-07 carries that rule.
