---
id: "ARCH-76"
title: "Ratchet limits live in one committed file that CI refuses to raise"
status: "open"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
order: 1
depends_on: []
---

# ARCH-76 · Ratchet limits live in one committed file that CI refuses to raise

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Tests and CI. Criterion: Guardrails and CI health. Structure only: no behaviour change.

## Why

- The CSS ratchet limits are literals (`scripts/check-css-duplication.js:129,159,166`), and `git log -L` shows them raised at least five times (9.78 to 9.97, 27,500 to 27,750). "Only ever go down" is a convention, not a check.
- Several tickets from this audit add new ratchets, which need one mechanism first.

## Outcome

- A committed JSON of limits read by every ratchet; a CI step fails when any value rises against `origin/main`. The CSS limits move onto it.

## Acceptance

- [ ] Raising a limit fails CI; lowering it passes.
- [ ] No ratchet literal remains in the CSS scripts.
