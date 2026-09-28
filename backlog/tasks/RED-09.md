---
id: "RED-09"
title: "Read-back check after every export: nothing extractable under any box"
status: "done"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: ["RED-12"]
---

# RED-09 · Read-back check after every export: nothing extractable under any box

**Superseded 2026-09-28.** Its read-back existed to check RED-12's invisible text layer, which was reverted; a covered page is now only a picture. The person-facing check of the saved file is RED-17.

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

## Result (2026-09-28)

`redactPdf` reads the saved file back through the same glyph reader (`textLayerReadsBack` in
`src/editor/adapters/pdf/textLayer.ts`): a covered page fails if any glyph sits under a box, or if any
word is missing or extra, and it fails closed (a page that can't be read back fails). A failing page is
saved again as the picture alone and the done state names it, e.g. "Page 3 was saved as a picture only,
so its text can't be selected." (`src/tools/redact/pictureOnlyNotice.ts`). The sabotage test in
`redact.test.js` writes the boxed word into the layer and checks the page comes back as a picture with
no text and is listed. On the real forms the check passes every time, so it costs nobody their text.
