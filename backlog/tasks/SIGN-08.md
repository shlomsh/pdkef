---
id: "SIGN-08"
title: "Share the effective typography descriptor"
status: "open"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# SIGN-08 · Share the effective typography descriptor

## Scope and acceptance

**Share the effective typography descriptor.** `fonts.js`, text renderer/serializer, font picker, `SignatureDialog`: resolve face, available weight/style, size, and direction once for preview and export. Unsupported styles must not silently export differently. Typed signatures must await fonts and fit their canvas without clipping. Extend the existing WYSIWYG epic rather than introducing a second engine.
