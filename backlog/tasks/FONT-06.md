---
id: "FONT-06"
title: "Urdu in Nastaliq"
status: "retired"
priority: "P3"
epic: "fonts-and-script-support"
phase: "unspecified"
depends_on: []
legacy_state: "Retired 2026-08-30"
---

# FONT-06 · Urdu in Nastaliq

## Scope and acceptance

~~**Urdu in Nastaliq.**~~ Urdu is fully served by the single bundled Naskh face, Scheherazade New. A calligraphic Nastaliq alternative would require an engine decision because `fontkit` crashes shaping Noto Nastaliq Urdu (`GPOSProcessor.getAnchor`), but that extra style is not needed now. Retired rather than blocked: do not reopen unless Urdu support itself develops a user-facing gap.
