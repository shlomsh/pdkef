---
id: "ARCH-06"
title: "Route Sign/Redact's own preference storage through workspace instead of raw localStorage"
status: "done"
priority: "P3"
epic: "editor-architecture"
phase: "unspecified"
depends_on: []
legacy_state: "Done 2026-08-30"
---

# ARCH-06 · Route Sign/Redact's own preference storage through workspace instead of raw localStorage

## Scope and acceptance

**Route Sign/Redact's own preference storage through workspace instead of raw `localStorage`.** `src/components/PdfSignTool.tsx` and `src/components/PdfRedactTool.tsx` call `localStorage.getItem`/`setItem` directly in roughly 15 places (last-used color, font, font size, symbol width/mark, signature width, text direction, saved signatures) — exactly the "no direct storage writes" boundary `components/SignTool` is meant to respect. Consolidate into one typed get/set helper in `editor/workspace/` (or the ARCH-05 destination of `draftStore.js`) and have both components call that instead. Also fixes the `'pdf-toolkit:lastWhiteoutColor'` key/logic currently copy-pasted between the two components.

**Completed 2026-08-30.** `preferenceStore.ts` now owns the typed key map, validation, and best-effort localStorage adapter; Sign and Redact use it for all editor preferences, including the shared whiteout-color key.
