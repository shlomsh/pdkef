---
id: "ARCH-84"
title: "The prose-only invariants each get a small guard"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
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

- [x] Each guard fails on a planted case and has a test.

## Done (2026-10-27)

check-never-say fails an em dash in copy (none exist today); check-reveal-observers and check-fetch-sites allowlist each IntersectionObserver and fetch site with its reason. Each guard failed on a planted case first; none found a violation. Each allowlist entry covers exactly one call site, so a second one in a listed file fails, as does a stale entry.
