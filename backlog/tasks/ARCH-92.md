---
id: "ARCH-92"
title: "Patched dependencies are pinned to the version their patch names"
status: "open"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 21
depends_on: []
---

# ARCH-92 · Patched dependencies are pinned to the version their patch names

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Supporting. Criterion: Dependency hygiene. Structure only: no behaviour change.

## Why

- `patches/@cantoo+pdf-lib+2.11.1.patch` (12.9 KB, encryption fixes) and `patches/@pdf-lib+fontkit+1.1.1.patch` name exact versions while `package.json` uses caret ranges. A minor bump skips or fails the patch.

## Outcome

- Exact pins for both, plus a check that each patch file's version matches the installed one.

## Acceptance

- [ ] A version mismatch between a patch and `package-lock.json` fails CI.
