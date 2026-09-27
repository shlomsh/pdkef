---
id: "RED-07"
title: "Remove text, image pixels and paths under each box, with per-page flattening fallback"
status: "open"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: ["RED-05", "RED-06"]
---

# RED-07 · Remove text, image pixels and paths under each box, with per-page flattening fallback

*Filed 2026-09-27 from RED-01's record, [docs/redact-content-removal.md](../../docs/redact-content-removal.md).*

Port the spike engine (`spikes/red-01/pdfium/engine-pdfium.mjs`) into the export path behind one pure
contract: page boxes in, a document out plus a per-page outcome (removed / flattened, and why).

- Text: whole-object removal, and the glyph-level rebuild for a partly covered run (read the whole
  page first, mutate second, per the embedpdf #801 note).
- Images: blank only the covered pixels; paths fully inside a box are removed.
- Blur and Whiteout keep their look: the removal happens under the box, the box is still drawn.
- Any case the engine can't handle, or any RED-05 fallback case, flattens that page as today.

## Acceptance

- The RED-01 corpus passes the checker through the real export, not the spike.
