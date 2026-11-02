---
id: "READ-17"
title: "Highlight PDF: a note card with one way to edit, and long notes kept short until opened"
status: "open"
priority: "P2"
epic: "highlight-pdf"
horizon: "now"
order: 17
depends_on: ["READ-15"]
needs: "Pick the card's model: A (the open note is its own field) or B (read first, a menu for Edit and Delete)"
---

# READ-17 · One edit path, long notes clamped

*Opened 2026-11-02.* Shlomi, on pdkef.com's desktop rail: "long comments should be limited in view" (a note
of about 75 words showed every line, taller than the page beside it), and "there is also double edit flow
here which should be rebuilt, the ux and action buttons should be rebuilt".

## What the card does today (`src/editor-ui/comments/CommentCardBody.tsx`)

- Read state: the whole text, unclamped. Sign shows a pencil glyph; Highlight's selected card shows Delete and
  Edit buttons (READ-15).
- Ways into editing: Edit, a click on the selected card's text, a double-click, Enter on the card. Four doors to
  one room, and none of them says which is the real one.
- Edit state: a bin, Cancel and a primary button labelled "Comment" (the same word for a new note and for saving
  a change to an old one). Delete shows in both states.
- The phone pane caps a card at 40vh and scrolls it; the rail has no cap.

## Two models (described, not sketched; sketch only the pick)

- **A. The open note is its own field.** A closed card shows at most four lines, fading out. Opening it (a click
  or tap on the card or its mark) shows the whole note with the cursor already in it, so there is no Edit step.
  A footer holds Delete (bin and word) at the start and Done at the end; a new note's button reads Comment.
  Leaving the card, Esc or Done keeps what was typed, and Undo takes a change back (guidelines §6, undo over
  confirm). Delete appears once. Lead's pick: the fewest states, and it reads as writing in a margin, not
  operating a form (the reading UX principle).
- **B. Read first, a menu for actions.** A closed card is clamped the same way; an open card shows the whole note
  and a "⋯" menu with Edit and Delete; Edit gives a field with Cancel and Save, no bin. Closer to common comment
  UIs, but it keeps a separate edit step.

Either way: the clamp lifts when a card opens, the phone pane keeps its fixed height and scrolls a long note
inside its card, and Sign's rail uses the same card body unless Shlomi says otherwise.

## Acceptance (after the pick)

- [ ] Shlomi picks A or B.
- [ ] A closed card shows at most four lines; the open card shows all of it, on the rail and in the phone pane.
- [ ] Exactly one way into editing an existing note, and Delete in exactly one place.
- [ ] The primary button says what it does: Comment for a new note, Done or Save for a change.
- [ ] A typed draft is never lost by leaving the card (READ-15's focus-out rule).
- [ ] Failing unit tests first; one e2e for the clamp's rendered height; checked in a desktop browser and on the
  iPhone simulator with screenshots.
