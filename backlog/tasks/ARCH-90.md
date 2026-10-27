---
id: "ARCH-90"
title: "Dependency overrides pin patched versions, not vulnerable ones"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
order: 11
depends_on: []
---

# ARCH-90 · Dependency overrides pin patched versions, not vulnerable ones

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Supporting. Criterion: Dependency hygiene. Structure only: no behaviour change.

## Why

- `package.json` overrides pin `fast-uri` to 3.1.8 and nx's `undici` to 7.30.0, exactly the vulnerable versions; they hold Dependabot alerts #43 to #46 and #49 open. Both are dev-only (appium and nx).

## Outcome

- Both overrides bumped to the patched releases (3.1.9, 7.30.1) or dropped.

## Acceptance

- [ ] Those five alerts close; `npm ci` and CI green.
