---
id: "READ-12"
title: "Highlight PDF: one owner for the open mark, one marking session, a smaller swipe hook"
status: "open"
priority: "P2"
epic: "highlight-pdf"
horizon: "next"
order: 12
depends_on: ["READ-03"]
---

# READ-12 · Simplify the Highlight tool's wiring

*Opened 2026-11-02 from the zero-context review of `1e729ad1..36f5a564`.* Structure only: no behaviour
changes, and every step keeps the existing tests green. Behaviour gaps the review found are in
[READ-01](READ-01.md)'s "Open from the 2026-11-02 reviews".

## Outcome

Which mark is open has one owner and one panel host, the marking API is built once, and the swipe hook is
small enough to read in one sitting. The steps below are in the order to do them.

## Steps

1. **One owner for the open mark.** Today a desktop panel is per page (`useRestToolbar`'s `targetId` plus the
   module global `activeClose`) and the touch panel is per workspace (`useMarkPanel`'s `markId` plus the
   `pickedId` / `onPickMark` props). Two hosts render the same `MarkPanel` (`RestToolbar` with
   `useToolbarDismissal`, `MarkerButton` with floating-ui's `useDismiss`), with two Escape and outside-press
   paths and keys in only one. Hold `openMarkId` once in the workspace; the rest detector only calls `open(id)`;
   one `MarkPanelHost` takes a placement ("above the mark" or "under the button") and owns keys and dismissal.
   Payoff: R9 and R39 on touch for free, no module singleton, and `HighlightPage` loses `pickedId`,
   `onPickMark` and its `coarse` branches.
2. **One marking session.** `HighlightPage` takes about twenty props, most of them passed through
   (`elements, marker, rearm, dispatch, logAction, setAnnouncement`), and `markCommands` is built twice
   (`HighlightPage.tsx`, `HighlightWorkspace.tsx`). Build one `commands` and one `session` in the workspace and
   hand them down as one prop or a context; `useMarkSwipe` and `useClickMarks` take the session.
3. **Split `useMarkSwipe`.** It mixes the press decision, the finger pan, second-finger abandonment and mark
   creation across seven window listeners and three cancel refs. Extract `usePendingPress` (listen, decide
   with the pure `swipeIntent`, then begin, pan or cancel) and keep `begin()` in `useMarkSwipe`.
4. **Derive the thickness options** (`LookControls.tsx`, `[1, 1.5, 2, 3, 4]`) from `UNDERLINE_WIDTH` in
   `underlineInk.ts`, so the picker cannot drift from `clampWidth`.
5. **Untangle `useNoteRoom`'s wiring** in `PdfHighlightTool.tsx`: it takes closures over values declared after
   it (`zoom: () => zoom`), which works only because they are read lazily. Return `makeRoom` and let the owner
   call it, or pass refs.

## Acceptance

- [ ] Each step lands on its own with `check:fast` green and no test changed except for moved code.
- [ ] After step 1, `grep activeClose src/tools/highlight` finds nothing and one component renders `MarkPanel`.
- [ ] After step 2, `markCommands(` is called in exactly one place.
