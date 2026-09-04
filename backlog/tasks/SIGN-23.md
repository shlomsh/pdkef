---
id: "SIGN-23"
title: "Make non-default language fonts explicitly offline-ready"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: ["SIGN-07", "SIGN-10"]
legacy_state: "Done 2026-09-04 — opt-in family packs with visible readiness and upgrade retention"
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

## What shipped

The chosen product policy is **incremental family provisioning**. Arimo Regular remains in the
initial app precache; every other selectable family has a “Make offline” action in the existing
font picker. A pack is not labelled “Ready offline” until every real Regular/Bold/Italic face
listed for that family in the generated font manifest is present. While disconnected, an
uncached row explicitly says “Connect to download”. The roughly 37 MB catalogue is therefore not
silently imposed on every visitor, and no second font or language catalogue was introduced.

The service worker owns provisioning and readiness through a small message protocol. Successful
packs carry a cache marker that distinguishes complete provisioning from incidental first-use
caching. Activation revalidates every marked face into the new content-versioned app cache before
deleting the old cache; if activation is offline, it retains the previous bytes. Drafts remain in
their separate IndexedDB store. Invalid/partial packs never receive a ready marker.

Export now preloads each document's exact resolved faces before coverage checking or PDF mutation.
If a selected family is unavailable, export stops with a named, recoverable error and tells the
user to reconnect and choose “Make offline”; it no longer silently substitutes Arimo for an
uncached Latin display face.

Chrome coverage reuses the language acceptance matrix to provision representative Simplified
Chinese (CJK), Arabic (RTL/shaping), and Bengali (shaping-heavy) families, disconnects the browser,
reloads the IndexedDB draft, edits all three fields, exports, and verifies searchable text from all
three scripts. Worker unit coverage verifies complete/partial packs plus online revalidation and
offline retention across an upgrade.

**Verification:** `npm test` (1973/1973), `npm run build`, `npm run typecheck`,
`npm run test:css`, `npm run test:csp`, `npm run test:weight`, `npm run test:fonts`,
`npm run test:editor-dependency-directions`, and the complete
`e2e/offline/offline-workflows.spec.js` Chromium suite (4/4) pass.
