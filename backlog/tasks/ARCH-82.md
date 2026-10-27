---
id: "ARCH-82"
title: "Behaviour tests find elements by role and label, not CSS Module class names"
status: "in_progress"
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

## Status 2026-10-27

- Wave 5 moved queries to roles, labels and existing data attributes in both halves of the test set; 32 test files still import a CSS Module.
- Most of what remains asserts a state class (selected, full screen, processing, a help row's mode). Shlomi kept the "fewer than 10" bar, so the next step is for those components to expose the state as a `data-*` attribute the tests read, invisible to people, while the class stays for styling.
- Wave 5 also replaced 13 class queries with positional selectors (`nextElementSibling`, `:scope > span:last-child`); those move to the new attributes too.
