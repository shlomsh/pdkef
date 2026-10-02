---
id: "ENC-10"
title: "Compress and Compress Image meet a protected PDF at the door, not at the button"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
order: 3
depends_on: ["ENC-01", "ENC-02"]
---

# ENC-10 · Compress and Compress Image meet a protected PDF at the door, not at the button

*Plan section 4.* Compress parses the file only when the person presses the main button (`compress.js:59`, `:200`), so a needs-password file is accepted, previewed as a generic glyph and rejected later with "may be password-protected or corrupted". An owner-only file works (pdf.js only, output intact, run), so it proceeds; the probe reports `owner-restricted` and the tool lets it through.

## Brief
- Probe at intake in `handleFilesAdded` for `needs-password` only; show `NeedsUnlock`. Compress Image is the same component; its return route is `/compress-image/` (ENC-02 map). Compress already has a receiver (`useHandoffIntake`).
- A file already under the target size is returned untouched at `compress.js:192-194`, before any parse, so a small needs-password file "compresses" to itself. Probe before that return.
- Keep the generic "may be password-protected or corrupted" body for a genuinely damaged file.

## Acceptance
- Island tests per route: needs-password shows the state before the button exists; owner-only proceeds and the output is intact; a small needs-password file never comes back labelled compressed.
