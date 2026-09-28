---
id: "RED-22"
title: "Every export checked four ways; a failing page is saved as a picture only, and RED-12's layer retires"
status: "open"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: ["RED-19", "RED-20", "RED-21"]
---

# RED-22 · Every export checked four ways; a failing page is saved as a picture only, and RED-12's layer retires

*Replaces RED-09's read-back, which re-read our own layer with the reader that wrote it.*

After every export, each covered page must pass RED-18's checks 1 to 4 (pixels, pdf.js text extraction,
bytes, annotations), each by a different method from the removal. A page that fails is saved as a picture
only (Shlomi, 2026-09-28), and the done state names it (`pictureOnlyNotice.ts`).

Once this ships, remove RED-12's invisible text layer (`textLayer.ts`'s planning and read-back,
`invisibleText.js` and its font) and update the Redact copy in `src/data/tools.js`, the two guide pages
and `flatten.svg`: covered pages keep their text as the original, and a failing page becomes a picture.

## Acceptance

- Each check has a sabotage test that makes it fail and sends the page to a picture only.
- No code path writes an invisible text layer.
