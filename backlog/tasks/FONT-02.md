---
id: "FONT-02"
title: "One font manifest"
status: "open"
priority: "P2"
epic: "fonts-and-script-support"
phase: "unspecified"
depends_on: []
legacy_state: "Open"
---

# FONT-02 · One font manifest

## Scope and acceptance

**One font manifest.** Collapse the five parallel edit sites for adding a font (`fonts.js`'s `TEXT_FONTS`/`SANS_STYLE_FONTS`/`FONT_VERTICAL_METRICS`, `editorFonts.css`, `FontPickerMenu.tsx`, `scripts/font-languages.mjs`, the Sign card copy in `tools.js`) into one `family -> { file per weight/style }` source that `editorFonts.css` generates from and `loadCustomFont` reads. Already overdue by its own stated trigger ("worth doing before wiring SC/TC/KR", which shipped without it). **Land before FONT-04** - three more languages at five manual edits each is exactly the cost this removes.
