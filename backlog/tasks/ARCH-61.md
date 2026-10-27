---
id: "ARCH-61"
title: "Unused exports and locals are a CI ratchet"
status: "open"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 8
depends_on: ["ARCH-76"]
---

# ARCH-61 · Unused exports and locals are a CI ratchet

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Dead code and unused surface. Structure only: no behaviour change.

## Why

- 239 symbols are exported but used only in their own file, 15 are never used at all (for example `get*Messages(_locale)` in `src/tools/edit-pages/messages.ts:119`, `scan/messages.ts:174`, `security/messages.ts:130`), and 294 more have only test importers.
- `tsconfig.json` has no `noUnusedLocals`; `astro check` reports 64 unused-import hints.

## Outcome

- A `check-unused-exports` script with a shrinking count, an allowlist for pages, endpoints and `content.config.ts`, and a naming convention for test seams.
- `noUnusedLocals` and `noUnusedParameters` on.

## Acceptance

- [ ] The 15 never-used symbols are deleted; the ratchet records the rest.
- [ ] Typecheck green with the new flags.
