---
id: "READ-17"
title: "Highlight PDF: a note card with one way to edit, and long notes kept short until opened"
status: "in_progress"
priority: "P2"
epic: "highlight-pdf"
horizon: "now"
order: 17
depends_on: ["READ-15"]
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

## Picked: B (2026-11-02)

Shlomi picked B from a clickable mockup of both. He added: clicking an open long note again collapses it back.
That is a toggle local to the card, not a deselect, so it works the same on the rail and in the phone pane (where
deselecting would close the pane).

The contract:

- **Closed** (not the active note): the text clamped to four lines; a click or Enter selects it. No pencil, no
  hint, no buttons.
- **Open** (active, not editing): the whole text and a ⋯ button (`commentMore`) with a menu of Edit and Delete.
  A click on the text, or Enter on the card, toggles it between whole and clamped; it opens whole each time it
  becomes active. Nothing else starts editing: no click-to-edit, no double-click.
- **Editing** (Edit, or a new note): the field, then Cancel and the primary button, Save (`commentSave`) for a
  saved note and Comment for a new one. No bin here: Delete lives only in the menu.
- Sign's rail and sheet use the same card body. The `readActions` prop is gone.

## Acceptance

- [x] Shlomi picks A or B (B, 2026-11-02).
- [ ] A closed card shows at most four lines; the open card shows all of it, on the rail and in the phone pane,
  and a click on an open card's text collapses it back.
- [ ] Exactly one way into editing an existing note, and Delete in exactly one place.
- [ ] The primary button says what it does: Comment for a new note, Save for a change.
- [ ] A typed draft is never lost by leaving the card (READ-15's focus-out rule).
- [ ] Failing unit tests first; one e2e for the clamp's rendered height; checked in a desktop browser and on the
  iPhone simulator with screenshots.
