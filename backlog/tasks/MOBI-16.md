---
id: "MOBI-16"
title: "On a phone the field moves are off-screen while you type: put them on the element, not the top toolbar"
status: "done"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-06"]
legacy_state: "Done 2026-09-22"
---

# MOBI-16 · On a phone the field moves are off-screen while you type: put them on the element, not the top toolbar

## What happened

MOBI-06 put Next and Previous in `EditorToolStatus`, on the reasoning recorded there: the status line
is the surface Sign and Redact already share, and a second floating control would be worse than
reusing it. On a desktop that is right. On an iPhone 16 Pro Max, filling the practice form with the
keyboard open, the buttons are not on the screen at all. Shlomi: "buttons might be better located in
context of the selected text element and not in the top toolbar."

**Why they vanish.** The chevrons live in the identity row of the sticky editor card - the DOM is
`.editor` → `.identity` → `.status` → `.help` → `.field-nav` (`ToolShell.tsx:154-183`,
`SignToolbar.tsx:378-381`, `EditorToolStatus.tsx:301-328`). `.editor` is
`position: sticky; top: env(safe-area-inset-top)` on a phone (`ToolShell.module.css:366,440-443`),
which sticks it to the *layout* viewport. iOS does not shrink the layout viewport when the soft
keyboard opens; it scrolls the *visual* viewport within it to keep the caret above the keyboard.
Everything stuck to the layout viewport's top therefore rides up out of sight. The gating is not the
problem - `fillingFields` is true while a text box is selected, so the control is mounted
(`SignToolbar.tsx:304-317`); it is simply above the visible area.

Nothing in the tool reacts to the keyboard except `bringFieldIntoView` (`useFieldNavigation.ts:136-149`),
and that runs only when a field-nav action fires - never on focus, never on a direct tap on a field,
and there is no `visualViewport` resize or scroll listener anywhere. Even the toolbar's one
height-based rule (`@media (max-height: 500px)`, `SignToolbar.module.css:494`) cannot fire here,
because a media query reads the layout viewport too.

The one piece of chrome that cannot drift is `.actions`, the per-element floating toolbar
(`EditorElement.module.css:27`), because Floating UI anchors it to the element itself
(`DraggableWrapper.tsx:107-149`). That is where the field moves belong on touch.

## The second half of the problem

The same screenshot shows why this is not just a move. `.actions` for a plain text box carries nine
buttons and five dividers - font, size down, size up, bold, italic, paragraph direction, colour,
duplicate, delete - and a box on a *detected* field, which is the common phone case, adds the
alignment cycle or the three comb controls, up to twelve buttons and six dividers
(`ElementToolbar.tsx:102-242`). That is roughly 361px of line against a page wrapper of roughly
340px, so it wraps to two rows - which its own CSS comment anticipates ("on a phone the text toolbar
is wider than the page", `EditorElement.module.css:20-26`). Two rows is ~76px sitting 8px above the
element: ~84px of document covered, directly over the fields just filled. There is **no responsive
rule anywhere that reduces this bar on a small screen**; the only coarse-pointer rule enlarges it.

None of those twelve is wanted *while typing a form field*. Font and size are chosen once per
document, not once per field.

**Measured, on a phone viewport against a production build.** `.page-wrapper` is 358 px inside a
440 px viewport, and the bar's cap is 340 px (the page width less Floating UI's 2x8 padding) - the
same 340 px for a field at 11.5% across the page and one at 75.3%, so its width does not depend on
where the field sits. Nine controls at that cap is two rows, 68 px tall. Under the page zoom iOS
applies on focus it is three rows at 1.8x and five at 3x; that mechanism is MOBI-17, and it is the
strongest argument for the one-row typing bar below.

**A hazard to fix while we are in here.** `.element-button` is 28px visually with a 44px hit box
added by `::before { inset: -8px }` under `@media (pointer: coarse)`
(`EditorControls.module.css:2-12`). On a wrapped two-row bar the row pitch is 32px, so the two rows'
44px hit boxes overlap vertically by about 12px, and nothing in the CSS accounts for it. Delete sits
in that second row.

## Proposed shape

Split `.actions` by a state the model already has: `isEditing` (caret in the box) is distinct from
`isActive` (selected), the split is an invariant in CLAUDE.md, and it already reaches the toolbar
(`DraggableWrapper.tsx:265-266`).

- **Editing:** one row - Previous, Next, and an `Aa` disclosure that opens today's controls on
  demand. One row instead of two gives back most of what the bar covers, and removes the overlapping
  hit boxes with it.
- **Selected, not editing:** today's set, unchanged. Desktop never notices.

**Placement is not open.** The bar is hard-pinned to `top-start`/`top-end` with no `flip()`, and
`.claude/rules/editor.md` bans reintroducing vertical flip because it jumped under the text in real
use. Note the consequence for this ticket: `shift()` and `size()` are bounded by the `.page-wrapper`,
**not by the viewport** (`DraggableWrapper.tsx:129-131`), so for a field near the top of a page the
bar is drawn above the page edge and scrolls out of reach like anything else. A one-row bar makes
that less likely; it does not remove it.

Genuinely open: does the element copy replace the `EditorToolStatus` one on touch, or sit alongside
it? The status-line copy still earns its place while a tool is armed and nothing is selected yet, and
it is the only copy a desktop or keyboard user sees. Against keeping both: on a phone the chevrons'
presence already hides the filename (`data-status-active`, `ToolShell.module.css:455-457`).

## Constraint worth writing down

**The strip directly above the keyboard is not ours.** The browser draws its own form accessory
there, with its own previous/next pair (up/down carets) and a done tick. It is not our markup: the
editor renders no up/down chevron pair anywhere, and its only tick belongs to the symbol mark picker
(`ElementToolbar.tsx:245-254`). So pinning our Next/Previous to the bottom of the visual viewport
would stack a second, differently-drawn pair of arrows immediately under the browser's. Attaching to
the element avoids that collision as well as the drift.

## Acceptance

While a text box is being typed into at a phone viewport, Next and Previous are visible without
scrolling, and the chrome over the document is one row rather than two. The formatting controls are
still reachable in one tap. Desktop behaviour is unchanged. Hit boxes stay at 44px and no two of them
overlap.

## Outcome (2026-09-22)

Shipped the proposed shape as `DraggableWrapper.tsx`'s `useCompactEditingBar`: while the element
actually in the edit session (`isEditing`) is a text box on a coarse pointer, `.actions` renders
Previous, Next, and an `Aa` disclosure instead of `ElementToolbar`, gated on the same `hasFields` check
`SignToolbar.tsx` already uses for the status-line copy - a free-placed box in a document with no
detected field still gets today's full toolbar. Tapping `Aa` swaps in the full toolbar with a small
collapse chevron beside it; the same toggle folds back. Pointer type is read once via
`window.matchMedia('(pointer: coarse)')`, the same computed-once pattern `ArmHint.tsx` already uses for
its own hover check, so desktop is untouched with no resize listener anywhere.

**Resolved the "genuinely open" question: sit alongside, not replace.** `EditorToolStatus`'s
status-line Previous/Next (MOBI-06) is unchanged - still the only copy a desktop or keyboard-only user
sees, and still present the instant a tool is armed before anything is selected. The element-anchored
pair is additive, mounted only for the one field actually being typed into. Both read from the same
`fieldNavigation` hook result (`PdfWorkspace.tsx` threads it to the active `DraggableWrapper` alone, so
every other element's wrapper never re-renders on a step), so they can never disagree about
hasNext/hasPrevious or which field is next.

Not attempted here: MOBI-17 (page zoom on focus, which can push the wrapped bar to three or five rows)
is a different mechanism and stays open on its own ticket - a one-row bar just makes hitting it less
likely, per the ticket text above.

Guards: `DraggableWrapper.test.tsx`'s "compact editing toolbar (MOBI-16)" block (jsdom, gates by pointer
type and by whether a `fieldNav` was supplied) and
`src/tools/sign/e2e/mobile-compact-editing-toolbar.spec.js` (real touch input and rendered rects: one
row under 44px tall on a phone viewport, the full toolbar on a fine pointer, Next actually stepping
fields without losing the caret session).
