---
id: "ARCH-11"
title: "Enforce editor dependency directions in CI"
status: "open"
priority: "P2"
epic: "editor-architecture"
phase: "longer-term"
depends_on: ["ARCH-10"]
legacy_state: "Open — architecture boundaries are documented but unenforced as of 2026-09-03"
---

# ARCH-11 · Enforce editor dependency directions in CI

## Scope and acceptance

**The target module boundaries are prose-only while several agents are changing the editor in
parallel.** `docs/editor-module-boundaries-plan.md` explicitly calls its dependency table a smell
test rather than an enforced import graph. The broader architecture standard calls `editor/`
framework-agnostic, while current files intentionally or accidentally mix concerns: registry
renderers import Preact, registry serialization types import pdf-lib, and a workspace hook imports
Preact. Without an executable rule, future changes cannot tell a permitted adapter seam from a
boundary regression, and completed extraction work can silently reverse.

First reconcile the two documents into one explicit dependency matrix for `editor/model`,
`editor/geometry`, `editor/text`, `editor/registry`, `editor/adapters/pdf`, `editor/workspace`, and
the Preact component shell. Decide where registry view renderers and framework hooks belong; do not
move them merely to satisfy an invented rule. Then add a small dependency-direction check using
resolved static imports, with narrow documented exceptions for agreed transition seams. At minimum,
pure model/geometry code must reject Preact, CSS, browser storage, and PDF libraries; components must
not bypass workspace persistence; and adapters must not import UI components. Add positive and
negative fixtures, run the guard in CI, and document the command. Land any necessary moves as
separate mechanical slices rather than a repository-wide reorganization.
