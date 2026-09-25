---
id: "FORM-22"
title: "A CI guard keeps field detection pure"
status: "open"
priority: "P2"
epic: "form-understanding"
phase: "near-term"
depends_on: ["ARCH-24"]
---

# FORM-22 · A CI guard keeps field detection pure

## Why

Audited 2026-09-25: the detectors are already pure, plain data in and plain data out, with every
pdf-lib, pdf.js and DOM access in a few thin boundary shims (`collectPageInk`, `pageWidgets`,
`widgetEntries`, `collectCheckboxGlyphs`, the scoring loader). Nothing keeps it that way. A
strategy that is swapped in is only swappable if it cannot reach outside its inputs, and the
project's rule is that an invariant is a check, not prose.

After ARCH-24 the capability is one folder, so the guard can be one folder's rule.

## Acceptance

- [ ] A script in the style of `check-gesture-golden-rule.js`, wired into `ci.yml` and the CLAUDE.md
      CI list: detector modules import no `pdfjs-dist`, `@cantoo/pdf-lib`, DOM or Preact, except the
      named boundary shims, and hold no module-level `let`/mutable state.
- [ ] Sabotage-checked: a stray import and a module-level cache each fail it.
- [ ] Runs in under a second; `check:fast` includes it if it touches detection files.
