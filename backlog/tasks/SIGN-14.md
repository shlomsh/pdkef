---
id: "SIGN-14"
title: "Separate editor core, UI, and export adapters incrementally"
status: "done"
priority: "P2"
epic: "sign-tool-architecture"
phase: "longer-term"
depends_on: []
legacy_state: "Done 2026-09-02"
---

# SIGN-14 · Separate editor core, UI, and export adapters incrementally

## Scope and acceptance

**Completed 2026-09-02.** The registry/UI import cycle and `actionHistory` → `sign` dependency were already removed. The remaining export boundary is now explicit: `textMetrics.ts` holds editor-safe shaping and coverage helpers; `textPdf.ts` owns pdf-lib drawing and is loaded only by `textDefinition.serialize`; and `PdfSignTool` loads the complete Sign export adapter only after the user chooses Download. This reduced Sign's first-load JavaScript from roughly 549KB to 293KB brotli (about 582KB to 325KB including the document), and `check-page-weight.js` now enforces a 400KB total first-load cap.

An export records the reducer's monotonic document revision. Any edit, undo, replacement, or file change revokes both a prepared share file and a running export, so a late result can neither download nor become shareable after the document has changed. Focused reducer and UI tests cover that stale-result case. Typing undo remains deliberately out of scope: it is optional P3 work under SIGN-12, not an export-adapter requirement.
