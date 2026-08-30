---
id: "FONT-07"
title: "Emoji"
status: "open"
priority: "P3"
epic: "fonts-and-script-support"
phase: "unspecified"
depends_on: []
legacy_state: "Open, not started"
---

# FONT-07 · Emoji

## Scope and acceptance

**Emoji.** A different problem from CJK subsetting: colour emoji (`COLR`/`CBDT`/layered-glyph formats) has no path through pdf-lib's outline-glyph embedder. Likely solution is image-embedding (the app already knows how to embed signature images), not font-embedding. Needs its own evaluation from scratch.
