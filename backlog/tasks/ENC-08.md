---
id: "ENC-08"
title: "Compress, Compress Image and PDF to Image meet a protected PDF at the door"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "later"
order: 2
depends_on: ["ENC-06"]
---

# ENC-08 · Compress, Compress Image and PDF to Image meet a protected PDF at the door

*Plan section 4.* Both parse the file only on the main button (`compress.js:59`, `:200`; `toImage.js:95`), so a needs-password file is accepted and rejected later with generic copy. An owner-only file works in both (pdf.js only, output intact, run), so only `needs-password` is gated.

## Brief
- Probe at intake in `handleFilesAdded`; show the shared state. Compress Image is the same component (`/compress-image/`). PDF to Image has no hand-off receiver, so add one.
- Compress: a file already under the target size is returned untouched at `compress.js:192-194`, before any parse, so a small needs-password file "compresses" to itself. Probe before that return.

## Acceptance
- Island tests per route: needs-password shows the state before the button exists; owner-only proceeds and the output is intact; a small needs-password file never comes back labelled compressed.
