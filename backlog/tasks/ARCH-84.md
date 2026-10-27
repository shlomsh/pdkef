---
id: "ARCH-84"
title: "The prose-only invariants each get a small guard"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 18
depends_on: []
---

# ARCH-84 · The prose-only invariants each get a small guard

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Tests and CI. Criterion: Guardrails and CI health. Structure only: no behaviour change.

## Why

- Invariants in CLAUDE.md with no check: "never reveal with an IntersectionObserver what JS first hid", "no em dashes" in user-facing copy (not in `check-never-say.mjs`), and "no fetch of file bytes" (only the CSP `connect-src` backstop and `csp-smoke.spec.js`; 5 `fetch(` calls in `src/` are unscanned).

## Outcome

- A scan for IntersectionObserver-driven reveals, an em-dash rule in `check-never-say`, and a static scan that allowlists each `fetch(` call site with its reason.

## Acceptance

- [ ] Each guard fails on a planted case and has a test.
