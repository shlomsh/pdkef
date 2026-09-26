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
- [x] Shlomi has tried it on his iPhone (2026-09-26, Chrome on iOS).

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

Shlomi's iPhone QA, 2026-09-26 (Chrome on iOS, Gboard):
- **Fullscreen did nothing** in fill mode: a guard turned it off, for a reason a Simulator probe did not
  reproduce. The guard is gone.
- **"Next" didn't bring the next field into view.** Chrome shows no ∧ ∨, so the return key is its only
  hop, and it focused the next field with `preventScroll`. It now lets the platform scroll; the
  Simulator follows focus down the page.
- ✓ to ✗ on a ticked box: the element bar already does it. No change.

Open, not fixed here:
- **Zoom hides the toolbar.** After typing, iOS stays zoomed in on the field and the toolbar is off
  screen, so Undo looks missing. SNG-16 (the app-owned camera).
- **Autocorrect.** iOS changed "Dana" to "Do" in a slot that carries `autocorrect="off"`.
- **A drag starts on first touch**, so a finger that means to scroll over a filled field moves it.
  SNG-04 decides the fix; UNDO-04 makes a move undoable. Both need Shlomi's go-ahead.

## Landed 2026-09-26

On main at a4e2f76b, behind `?next=1`, with SIGN-35 and UNDO-04 merged in. After his QA:
- Fullscreen works in fill mode. Next (the return key) moves focus and the zoom follows.
- Second review fixed: a box claims only a mark's tap or a tap inside it; a placed mark stays selected;
  plain taps take production's click path; the dead `filling` state is gone.

On the branch only (52202a5e), waiting for Shlomi's phone check before landing:
- The comb caret is drawn by `CombCells` at the centre of the next cell (`useCombCaret`).
- `textElementLayout` (signHelpers.js) is the one box and typography rule for DraggableWrapper,
  TextNode and FieldSlot, so a slot previews exactly the element it becomes. This touches production's
  text elements too.

Still open:
- **Ticks on form 101 look off-centre** (his screenshot, ❑ glyph boxes). A corpus measurement found
  detection and placement exact but did not find the ❑ glyphs, so it is not settled. Measure in the
  real app with `src/tools/sign/fields/corpus/scoring/forms/income-tax-101-2024.pdf`. SNG-09 territory.
- Autocorrect, first-touch drag (SNG-04) and the app-owned camera (SNG-16), as listed above.

## Branch work, 2026-09-26 (after his QA of a4e2f76b)

Landing with: the comb caret in the next cell and `textElementLayout` (52202a5e); an open comb in a cell
takes its row's size, and a slot is exactly its element's box (dd16d642); autocorrect really off on iOS,
since WebKit's `autocorrect` is a boolean property and the string "off" turned it on (8149ee29); a cell
slot is the cell's width and the comb caret counts graphemes (ca830e7a, review findings); SNG-04's first
slice (b937c0ef). Shlomi checked combs, plain fields, autocorrect and one-finger scroll on his iPhone.

Split out: the toolbar under native zoom (SNG-17, after SNG-16 was retired), the practice form dropping
`?next=1` (SNG-18), ticks in form 101's glyph boxes (SNG-09, a separate session).
