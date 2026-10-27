---
id: "ARCH-82"
title: "Behaviour tests find elements by role and label, not CSS Module class names"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
order: 16
depends_on: []
---

# ARCH-82 · Behaviour tests find elements by role and label, not CSS Module class names

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Tests and CI. Criterion: Test architecture. Structure only: no behaviour change.

## Why

- 41 tsx/jsx tests import `*.module.css` class names to find elements, so renaming a class breaks tests that assert behaviour.

## Outcome

- Queries move to roles, labels and test ids where no role fits; class assertions stay only where the class is the thing under test.

## Acceptance

- [ ] Fewer than 10 tests import a CSS Module, each asserting styling on purpose.
