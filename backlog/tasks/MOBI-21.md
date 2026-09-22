---
id: "MOBI-21"
title: "There is no way back into a text box on touch once its edit session closes"
status: "open"
priority: "P1"
epic: "mobile-round-trip"
phase: "release-blocker"
depends_on: []
legacy_state: "Open"
---

# MOBI-21 · There is no way back into a text box on touch once its edit session closes

## What happened

Shlomi, on the live /sign/ on an iPhone, having typed into a detected field: "Now i can not edit the
text field i tried very hard."

Reproduced at a 390x844 touch viewport. After the session closes the box is selected but inert
(`text-input-inert`: `pointer-events: none`, `readOnly`, `tabIndex -1`), the full element toolbar is
back and the chevrons have returned to the top card - exactly the reported screenshot. From there:

- every tap on the box **created another empty text box**: element count went 1 -> 2 -> 3 -> 4 across
  three taps, with the active selection jumping to each new one;
- this happened with **no tool armed at all**, which contradicts the one-shot rule in
  `.claude/rules/editor.md` ("the click after a placement means deselect");
- the original text was never reachable again.

So "tried very hard" was literally stacking invisible empty boxes, and they would go into the export.

## Why it is mechanically impossible, not merely awkward

The only pointer route into `onBeginEdit` is `TextNode.tsx`'s `onDblClick`. On touch it can never
fire: `useDraggableElement.js` calls `onSelect(e)`, returns early only when `e.target` is an INPUT or
TEXTAREA, and otherwise `e.preventDefault()`s the `touchstart`. Outside a session the textarea is
`pointer-events: none`, so `e.target` is the `.text-display` div and the early return never applies -
and `preventDefault()` on `touchstart` suppresses the whole synthesised mouse sequence, so there is no
`click`, therefore no `dblclick`. On desktop the same handler runs on `mousedown`, where
`preventDefault()` does not suppress `click`, which is why this is touch-only and why no test caught
it (jsdom has no `pointer-events` and no touch-to-mouse synthesis).

**What closes the session:** `PdfWorkspace.tsx`'s `deactivateAll`, wired to the pages container's
`onClick`. Tapping the page background is the standard iOS way to dismiss the keyboard, and here it
is a one-way deselect.

The only escapes that exist today are Next/Previous (which re-open a session on arrival) and Enter on
a hardware keyboard. Nothing says so.

## Two more findings from the same trace

- **A text box narrower than ~46 CSS px has zero tappable text.** The coarse-pointer resize halos
  reach 22px inward from each side whatever the height, so they meet in the middle. At 60px wide only
  a 14px strip survives. MOBI-19 changed how the handles look, not what they swallow.
- **The textarea has no `onBlur`.** A blur with no accompanying state change leaves `editingElementId`
  set with no caret and no keyboard - the compact bar stays up over a box that cannot be typed into.

## Proposed shape

A tap on an already-**selected** text box opens its edit session: first tap selects, second tap edits.
No double-tap, so no conflict with the browser's zoom gesture, and `docs/ux-design-guidelines.md` §8
already prescribes exactly that shape for touch ("tap an item to reveal that item's controls"). The
dblclick path stays for desktop.

Separately, and independently worth fixing: a tap that lands on an existing element must never create
a new one.

## Acceptance

At a phone viewport, a text box whose session has closed can be typed into again without using
Next/Previous, in one gesture. Tapping an existing box never adds an element. A box under 46px wide
has a tappable text area. Desktop behaviour is unchanged. Guarded by a Playwright spec, since jsdom
can prove none of it.
