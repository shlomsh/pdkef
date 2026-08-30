---
id: "SIGN-07"
title: "Make the offline requirement testable"
status: "open"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# SIGN-07 · Make the offline requirement testable

## Scope and acceptance

**Make the offline requirement testable.** Service worker, precache generator, fonts/PDF worker loaders: define asset provisioning and offline-ready status for every advertised workflow/language; version caches by asset content, including unchanged font URLs. Chrome tests must disconnect the network and open/edit/export using provisioned assets, then test upgrades without losing drafts. Current Arimo-only font precache is not full language support.
