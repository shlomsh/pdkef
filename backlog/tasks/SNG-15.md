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
- [ ] On a touch screen the toolbar hides while typing. On desktop it stays.
- [ ] Without `?next=1` nothing changes, and every existing test stays green.
- [ ] Every decision is a pure function with unit tests. A zero-context review passes.
- [ ] Shlomi has tried it on his iPhone.
