---
id: "SNG-04"
title: "One interaction machine and one input router, pure and synchronous, with the MOBI history as tests"
status: "open"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: ["SNG-03"]
---

# SNG-04 · One interaction machine and one input router, pure and synchronous, with the MOBI history as tests

`docs/sign-next-gen.md` §5.3-5.4 and §7.

**The machine** (`src/editor/interaction/`):
- It is a synchronous interpreter. `send(event)` runs the transition and its effects in the caller's stack, including `input.focus()` inside the touch handler. Only then does it notify the views.
- It is never `useReducer` plus `useEffect`. That is the MOBI-24 trap.

**The router** (`src/editor-ui/`):
- One Pointer Events entry point that classifies each sequence once, with one set of screen-px constants.
- A second finger cancels on `touchstart`, on move and on release.
- A touch never moves an element that was not selected before it began. A swipe on an unselected element scrolls.
- A movement slop comes before an element follows a finger.

## Acceptance

- [ ] Every MOBI regression is a unit test of transitions, fed synthetic pointer streams. This includes the 2026-09-25 staggered-finger commit race and the create path's missing multi-touch guard.
- [ ] Illegal states are unrepresentable: editing implies selected, and a pinch excludes a drag.
- [ ] `useDraggableElement` and `useElementResize` keep their geometry and commit math, and lose their claim logic.
