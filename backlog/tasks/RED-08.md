---
id: "RED-08"
title: "Annotations, form field values and form XObjects under a box"
status: "open"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: ["RED-07"]
---

# RED-08 · Annotations, form field values and form XObjects under a box

*Filed 2026-09-27 from RED-01's record, [docs/redact-content-removal.md](../../docs/redact-content-removal.md).*

Both RED-01 engines left these untouched, so a secret in them survives a redaction.

- An annotation or form field whose rect meets a box: remove it, or flatten it and remove what it
  covers. Its text must not survive in `/Contents`, `/V` or an appearance stream.
- Form XObjects: descend into their content and apply the same removal.

## Acceptance

- `freetext-annotation.pdf` and `form-xobject-text.pdf` pass the RED-01 checker.
