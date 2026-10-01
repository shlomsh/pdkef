---
id: "QUAL-18"
title: "npm install in a fresh worktree leaves package-lock.json unchanged"
status: "in_progress"
priority: "P3"
epic: "site-quality"
phase: "near-term"
depends_on: []
---

# QUAL-18 · npm install in a fresh worktree leaves package-lock.json unchanged

Every fresh worktree's `npm install` rewrites package-lock.json, which then shows as a change and makes `check:fast` widen to the whole suite. Find the cause (npm version, optional platform packages, a missing field) and fix it at the source.

## Acceptance
- `git worktree add` then `npm install` leaves `git status` clean.
