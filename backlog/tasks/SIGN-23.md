---
id: "SIGN-23"
title: "Make non-default language fonts explicitly offline-ready"
status: "in_progress"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: ["SIGN-07", "SIGN-10"]
legacy_state: "Open — extracted 2026-09-03 from SIGN-07's documented remaining scope"
---

# SIGN-23 · Make non-default language fonts explicitly offline-ready

## Scope and acceptance

**The app shell and default English font work offline, but advertised non-default language
support has no explicit provisioning contract or readiness signal.** SIGN-07 deliberately leaves
the roughly 37 MB non-default font catalogue out of precache and verifies only the default
English/Arimo Sign path. Other faces are cached on first use, so a user cannot currently tell
whether a chosen Arabic, Hebrew, Indic, CJK, or other supported face is ready for a disconnected
edit/export session. A cache upgrade must also not silently discard provisioned language support.

Choose and document one product policy before implementation: bundle every advertised face up
front, or let users provision selected language/font packs with a visible offline-ready state.
Given the current asset size, prefer incremental family provisioning unless measurements support
the full bundle. Reuse the generated font manifest and language acceptance matrix; do not create a
second language catalogue. Add Chrome coverage that provisions representative RTL, shaping-heavy,
and CJK faces, disconnects the network, then opens, edits, and exports searchable text with the
selected face. Cover the uncached case with an honest, actionable state rather than silent fallback,
and verify service-worker upgrades retain or deliberately re-provision installed faces without
affecting drafts. No processing server or online export fallback is allowed.
