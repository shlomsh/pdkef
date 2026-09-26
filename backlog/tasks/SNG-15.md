---
id: "SNG-15"
title: "Fill mode, slice 1: the production editor with every writing spot a real field the platform's own arrows hop"
status: "in_progress"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: ["SNG-14"]
---

# SNG-15 · Fill mode, slice 1: the production editor with every writing spot a real field the platform's own arrows hop

*Filed 2026-09-26.* SNG-14 proved the model on a throwaway page and on Shlomi's iPhone. This slice brings it
into production Sign, opt-in with `?next=1`, reusing every production tool. Shlomi's bar for the code:
"clean, well architectured, mostly pure functional code broken into the right components and SOLID
patterns".

The contract is `docs/sign-fill-mode.md` and `src/tools/sign/fill/fillTypes.ts`.

## Acceptance

- [ ] With `?next=1`, iOS's arrows and the return key's "next" visit every detected field and placed text
  element in reading order, across pages, with the keyboard up throughout (iOS Simulator).
- [ ] A slot left with text becomes one text element (one undo step). A slot left empty leaves nothing.
- [ ] A tap near a field focuses it. A tap away while typing only finishes typing. Esc ends typing.
- [ ] A faint frame on slots at rest. The droppable look for the armed tool near the pointer or finger.
- [x] The main toolbar stays while typing on every pointer (reversed 2026-09-26: hiding it took Sign,
  Date, the mark, Undo and Redo away on a form, where a field nearly always has focus).
- [ ] Without `?next=1` nothing changes, and every existing test stays green.
- [ ] Every decision is a pure function with unit tests. A zero-context review passes.
- [ ] Shlomi has tried it on his iPhone.

## Parity pass, 2026-09-26 (iOS 26 Simulator, iPhone 17 Pro, practice form)

Shlomi's iPhone report: combs showed plain digits until left; Undo wasn't visible and didn't undo a move;
no way to find Date, tick a box or sign. Each step below was done as a person filling the form would,
with `?next=1`. Production was run for ticking a box and Undo only; its other cells say "same code"
where fill mode calls production's own path unchanged, not that the step was re-run.

| Step | `?next=1` | Production | Notes |
| --- | --- | --- | --- |
| Type a field, hop with ∧ ∨ | pass | n/a | |
| Comb (ID number) fills its cells as you type | pass | same code | live since 8b372959; the caret sits a little off the cells |
| Tick a box, nothing armed | pass | run: needs ✓ armed | e059cb2f: a selected mark's 44px handle over the next box swallowed the tap |
| Untick a box, nothing armed | pass | needs ✓ armed | e059cb2f: no click follows a touch that starts on a mark |
| Date | pass | same code | toolbar Date, then a tap on the field |
| Sign | pass | same code | lands where tapped, not on the Signature line |
| Move the signature | pass | same code | |
| Undo/Redo an added element | pass | run: pass | |
| Undo a move | fail | same code | UNDO-04: Undo removes the element, Redo brings it back at its old spot |
| Font size, bold, colour of a filled field | pass | same code | 3804a4d4: fill mode hid the element bar and handles on touch |
| Reload restores the draft | pass | same code | |
| Download | pass | same code | every mark and text in the PDF |

Open, not fixed here:
- **Zoom hides the toolbar.** After typing, iOS stays zoomed in on the field and the toolbar is off
  screen, so Undo looks missing. SNG-16 (the app-owned camera).
- **Autocorrect.** iOS changed "Dana" to "Do" in a slot that carries `autocorrect="off"`.
- **Fullscreen.** With fill mode's guard removed for a probe, ∨ reached a field below the fold and
  iOS scrolled it into view, so the documented reason for turning fullscreen off did not reproduce on
  the Simulator. Still off; Shlomi to confirm on his iPhone before it comes back.
- **A drag starts on first touch**, so a finger that means to scroll over a filled field moves it.
  SNG-04 decides the fix; UNDO-04 makes a move undoable. Both need Shlomi's go-ahead.
