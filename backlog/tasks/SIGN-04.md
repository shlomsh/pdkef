---
id: "SIGN-04"
title: "Preserve Unicode content and whitespace"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
depends_on: []
---

# SIGN-04 · Preserve Unicode content and whitespace

## Scope and acceptance

**Preserve Unicode content and whitespace.** `textTransforms.js` now removes only unsafe C0/C1 controls while preserving format characters such as ZWJ/ZWNJ and bidi controls; coverage exempts those non-ink controls without deleting them. `registry/text.ts` preserves leading/trailing spaces and blank physical lines. Real Scheherazade New shaping proves Persian ZWNJ changes the joined glyph sequence, and the `pdftotext` export guard proves that authored ZWNJ remains searchable. Existing combining-mark coverage remains green; no text rasterization was introduced.
