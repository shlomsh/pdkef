---
id: "SIGN-45"
title: "Sign: nothing is armed by default; a click makes text only when Text is picked"
status: "done"
priority: "P1"
epic: "polish"
depends_on: []
---

# SIGN-45 · Nothing is armed by default; a click makes text only when Text is picked

*Filed 2026-10-31.* Shlomi: "as default, click should not add a text element unless specifically
selected by the user. the tool defaults to a selected text for some reason", and "i can not unselect the
text element neither". Fill mode treated no tool as Text (`fillTypes.ts` 'none', `fillTap.ts`, and
`SignToolbar.tsx`'s `textChosen`), so the Text button looked pressed with nothing armed, could not be
turned off, and any click on the page opened a text box or started typing in a detected line.

## Outcome

With nothing armed, the Text button is not pressed, and a click on the page never opens, focuses or
creates text: no free slot, no focus-by-reach on a detected line. Text the person already placed stays
editable by clicking it. Pressing Text arms it; pressing it again disarms it. With Text armed, fill mode
behaves exactly as before.

## Acceptance

- [x] `fillTapDecision` unit tests: tool 'none' gives no `freeSlot` and no `focus` by reach; 'text' is unchanged.
- [x] The Text button's pressed state is `selectedTool === 'text'` only; a second press disarms.
- [x] Hints: with nothing armed, no text target gets the droppable look.
- [x] docs/sign-fill-mode.md "Taps" and "Hints", and `.claude/rules/editor.md` if it states the old rule, say the new one.
- [x] Checked in a real browser on desktop and at a phone size.

## Done 2026-10-31

Nothing is armed when a document opens. Text reads as pressed only when it is armed, a click with nothing armed makes no text and opens no keyboard, Text places once and disarms, and a double press locks it for several fields in a row. e2e `sign-nothing-armed.spec.js` covers desktop and phone (8 tests: fresh state, arm and disarm, the double-press lock, re-editing placed text) and passes in Chromium and WebKit. `.claude/rules/editor.md` did not state the old rule; docs/sign-fill-mode.md and docs/sign-next-gen-guidelines.md do now.
