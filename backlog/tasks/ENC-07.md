---
id: "ENC-07"
title: "Compress and PDF to Image meet a protected PDF at the door, not at the button"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
order: 6
depends_on: ["ENC-01", "ENC-02"]
---

# ENC-07 · Compress and PDF to Image meet a protected PDF at the door, not at the button

*Plan section 4.* Both parse the file only when the person presses the main button
(`compress.js:59`, `toImage.js:95`), so a needs-password file is accepted, previewed as a generic glyph,
and rejected later with "may be password-protected or corrupted". An owner-only file works in both (pdf.js
only, output intact), so no gate is needed for it there; the probe still reports `owner-restricted`, and
these tools let it through.

## Brief
- Probe at intake in `handleFilesAdded` for `needs-password` only; show `NeedsUnlock`. Compress Image is
  the same component and gets it for free.
- Compress: a file already under the target size is returned untouched at `compress.js:192-194`, before any
  parse, so a small protected file "compresses" to itself. Probe before that return.
- Keep the generic "may be password-protected or corrupted" body for a genuinely damaged file.

## Acceptance
- Island tests per tool: needs-password shows the state before the button exists; owner-only proceeds and
  the output is intact; a small protected file never comes back labelled compressed.
