---
id: "RED-08"
title: "Annotations, form field values and form XObjects under a box"
status: "retired"
priority: "P1"
epic: "redact-tool"
depends_on: ["RED-07"]
---

# RED-08 · Annotations, form field values and form XObjects under a box

**Retired 2026-09-27** in favour of RED-12: annotations, field values and form XObjects under a box only survive when content is edited in place. Whatever today's picture export still carries over is checked by RED-12's audit item. Shlomi's review of the epic found the engine path cost more than the one problem it solved (text on covered pages can't be selected or searched). The PDFium measurements stay in [docs/redact-content-removal.md](../../docs/redact-content-removal.md) if vector fidelity or file size is ever asked for.

*Filed 2026-09-27 from RED-01's record, [docs/redact-content-removal.md](../../docs/redact-content-removal.md).*

Both RED-01 engines left these untouched, so a secret in them survives a redaction.

- An annotation or form field whose rect meets a box: remove it, or flatten it and remove what it
  covers. Its text must not survive in `/Contents`, `/V` or an appearance stream.
- Form XObjects: descend into their content and apply the same removal.

## Acceptance

- `freetext-annotation.pdf` and `form-xobject-text.pdf` pass the RED-01 checker.
