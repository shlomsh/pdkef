---
id: "RED-21"
title: "True redaction: form field values, comments, watermark annotations and shared form content under a box"
status: "open"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: ["RED-18"]
---

# RED-21 · True redaction: form field values, comments, watermark annotations and shared form content under a box

*Built only if RED-18 meets its bar. RED-01 found both engines left annotations and form XObjects
untouched.*

- A form field whose widget a box touches loses its value (`/V` and its appearance), not just its
  picture.
- Comments, FreeText and Watermark annotations under a box are removed.
- A form XObject shared with other pages is copied before it is edited, so no other page changes.
- A text watermark follows RED-19's rules.

## Acceptance

- A filled I-9 field covered by a box: the saved file holds neither the value nor its appearance.
- A header drawn from one form XObject on every page, covered on page 1 only: page 2 is unchanged.
