---
id: "ENC-11"
title: "PDF to Image meets a protected PDF at the door and can take a file back"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
order: 6
depends_on: ["ENC-01", "ENC-02"]
---

# ENC-11 · PDF to Image meets a protected PDF at the door and can take a file back

*Plan section 4.* PDF to Image parses on Convert (`toImage.js:95`), so a needs-password file is rejected late with generic copy (`PdfToImageTool.tsx:277-279`). An owner-only file renders fine (pdf.js only, run).

## Brief
- Probe at intake for `needs-password`; show `NeedsUnlock`. Add a hand-off receiver (the tool has none) using its key from the ENC-02 map.

## Acceptance
- Island test: needs-password shows the state, owner-only converts, a handed-off file opens.
