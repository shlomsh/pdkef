---
id: "MOBI-34"
title: "Field-to-field navigation reads the reviewed field map, not the raw detector output"
status: "open"
priority: "P3"
epic: "form-understanding"
phase: "near-term"
depends_on: ["MOBI-33"]
---

# MOBI-34 · Navigation reads the reviewed map

*Split from MOBI-11 on 2026-09-25.*

MOBI-06 shipped next/previous field navigation over the raw detector output. If MOBI-33 decides
Sign gets a review layer, navigation must walk the map as the person reviewed it (deleted fields
skipped, added ones included, their order), not what the detector first proposed.

If MOBI-33 decides to stay hints-only, retire this ticket with it.

## Acceptance

- [ ] Next/previous visits exactly the reviewed fields, in the reviewed order.
- [ ] A field deleted in review is never visited; a field added in review is.
