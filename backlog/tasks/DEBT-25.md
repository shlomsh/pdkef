---
id: "DEBT-25"
title: "A guard so the next swallowed error is a decision, not an accident"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "next"
order: 3
depends_on: ["DEBT-17"]
---

# DEBT-25 · A guard so the next swallowed error is a decision, not an accident

*Filed 2026-10-01, out of DEBT-17.* DEBT-17 sorted 152 catches into 106 expected and 46 defects
(`docs/debt-17-catch-triage.md`) and wrote the rule in `.claude/rules/tools-and-shell.md`. A rule
in prose drifts. A static check makes it hold: every catch that discards its error must either call
`reportError` or carry an `// expected:` comment saying why, enforced as a ratchet that starts at
today's count of unannotated catches and only goes down.

## Acceptance

- [ ] `scripts/check-swallowed-errors.mjs` in `ci.yml`, with a baseline that only goes down.
- [ ] The rule in `tools-and-shell.md` points at it.
