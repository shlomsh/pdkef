---
id: "SNG-04"
title: "One interaction machine and one input router, pure and synchronous, with the MOBI history as tests"
status: "open"
priority: "P1"
epic: "sign-fill-mode"
horizon: "later"
order: 2
depends_on: []
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

The normative rules are `docs/sign-next-gen-guidelines.md`:
- SNG-04 implements §2 (states, input tables, the one set of constants) and §3's boundary table.
- SNG-05 implements §1 and §3-§6.
- Both answer §11's checklist.

## Acceptance

- [ ] Every MOBI regression is a unit test of transitions, fed synthetic pointer streams. This includes the 2026-09-25 staggered-finger commit race and the create path's missing multi-touch guard.
- [ ] Illegal states are unrepresentable: editing implies selected, and a pinch excludes a drag.
- [ ] `useDraggableElement` and `useElementResize` keep their geometry and commit math, and lose their claim logic.

## Slice 1, 2026-09-26: a finger scrolls over an element that is not selected (fill mode)

`touchClaimsElement` (src/editor/gestures/touchClaim.ts) is the pure rule. `useDraggableElement` returns
before select/preventDefault for a touch on an element not selected before it began, and
`.element[data-touch-scroll]` lets one finger pan natively; a tap still arrives as the synthesised click
and selects. Mouse and production (no `?next=1`) are unchanged. Shlomi confirmed on his iPhone.
Still to do: the 8px slop before a selected element follows the finger, one constants table, and the
machine and router this ticket describes.

## 2026-10-01 board cleanup

- Status in_progress -> open. Touch-claim slice 1 shipped (`touchClaim.ts`, b937c0e); the machine and router remain. Dropped SNG-03 from depends_on (retired).

## Slice 2, 2026-10-03: the gesture machine, pure, not wired
`src/editor/interaction/` holds `constants.ts` (the §2.5 table, proposed values marked), `gestureMachine.ts` (`transition(state, event) => { state, effects }` plus `createGestureMachine`, whose `send` commits state and then runs effects in the caller's stack) and 11 transition tests on synthetic streams: the 2026-09-25 staggered-finger race, the create path's missing second-finger guard, scroll over an unselected element, the 8px slop, pinch excluding drag, mouse. Nothing imports it yet.
Decisions to confirm before wiring: pen is treated like a mouse; a touch drag on blank with a create tool armed creates; the drag begins at distance >= 8 and the element jumps to the finger (re-basing at the crossing is the alternative); the 75ms second-finger window is not enforced (any second finger before commit pinches, which is stricter); the finger left after a pinch only scrolls. Guidelines §3 has no gesture boundary table, so that part of this ticket's text has nothing to implement.
Still to do: the router in `src/editor-ui/`, routing `useDraggableElement` through the machine behind `?next=1`, then the resize and create paths, and `touchClaim.ts` folded in.

## Parked 2026-10-03 (Shlomi)
Slice 2 stands on its own: the machine is pure and nothing imports it. Picking this up means settling the five calls listed under Slice 2, then the router and routing `useDraggableElement` through the machine behind `?next=1`, with Shlomi on the iPhone for the wiring.

