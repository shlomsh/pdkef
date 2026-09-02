---
id: "ARCH-06"
title: "Route Sign/Redact's own preference storage through workspace instead of raw localStorage"
status: "open"
priority: "P3"
epic: "editor-architecture"
phase: "unspecified"
depends_on: []
legacy_state: "Reopened 2026-09-02 — SignatureDialog still writes raw localStorage"
---

# ARCH-06 · Route Sign/Redact's own preference storage through workspace instead of raw localStorage

## Scope and acceptance

**Route Sign/Redact's own preference storage through workspace instead of raw `localStorage`.** `src/components/PdfSignTool.tsx` and `src/components/PdfRedactTool.tsx` call `localStorage.getItem`/`setItem` directly in roughly 15 places (last-used color, font, font size, symbol width/mark, signature width, text direction, saved signatures) — exactly the "no direct storage writes" boundary `components/SignTool` is meant to respect. Consolidate into one typed get/set helper in `editor/workspace/` (or the ARCH-05 destination of `draftStore.js`) and have both components call that instead. Also fixes the `'pdf-toolkit:lastWhiteoutColor'` key/logic currently copy-pasted between the two components.

**Completed 2026-08-30.** `preferenceStore.ts` now owns the typed key map, validation, and best-effort localStorage adapter; Sign and Redact use it for all editor preferences, including the shared whiteout-color key.

**Reopened 2026-09-02.** `src/components/SignatureDialog.tsx` still reads and writes
`pdf-toolkit:penColor` and `pdf-toolkit:penThickness` directly. This is part of the Sign
editor and is the same UI-to-storage dependency this task removed elsewhere; it also
accepts `parseFloat()` results without the positive/finite validation used by
`preferenceStore.ts`. Add both settings to the typed workspace preference contract,
migrate the dialog to it, and cover valid, corrupt, and unavailable-storage reads. The
global pre-paint view-density script is deliberately out of scope because it has a
separate synchronous first-paint contract.
