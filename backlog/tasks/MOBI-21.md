---
id: "MOBI-21"
title: "There is no way back into a text box on touch once its edit session closes"
status: "done"
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

## Fixed, 2026-09-22

**Bisected first, because it decided the response.** The lockout is on the morning's base 56b027a as well as
on main, so it was not a regression from that day's merges and no revert could restore service; the forward
fix was the incident remedy. It was a path nobody had walked, not a change that broke one.

**One tap opens a text box on touch** (`useDraggableElement.js`, `DraggableWrapper.tsx`). The gesture layer
now knows what a tap is: a touch gesture that releases within the browsers' own 8px touch slop. On a coarse
pointer that tap selects the box and opens its edit session in one gesture, the way every mobile form works.
Nothing is lost - a move is a drag, which is movement, and delete and formatting are on the element's bar
while editing. Mouse input never sets the tap flag, so desktop click-selects / double-click-edits exactly as
before. The empty-box placeholder says "Tap to type" on a coarse pointer instead of "Double-click to edit",
which told phone users to make the one gesture that cannot work there.

**The stray boxes were the element's own bar, not the arming model.** Found by logging every event target:
on a 5.8px-tall box the bar floats 8px above it, and each coarse-pointer button's 44px hit area overhangs the
button by 8px - onto the box. Taps aimed at the text hit the bar. Measured both ways depending on where the
bar sits: **Duplicate**, cloning the element into the export on every tap (1 -> 2 -> 3 -> 4), and **Delete**,
destroying what had just been typed (1 -> 0). The coarse-pointer offset now includes that overhang, so the
bar's hit boxes end at the element's top edge. The earlier theory in this ticket, that a tap with no tool
armed was creating elements, was wrong: nothing was created, something was cloned.

**Guards**, each proven red-to-green against a real build:
- `touch-edit-reentry.spec.js` - one tap reopens a closed box and typing lands in it; one tap opens a different
  box; a drag moves without opening; and after a drag, a tap on a short box never lands on the bar (red
  without the offset fix: the tap deleted the element).
- `phone-fill-journey.spec.js` - the whole round trip on the practice form: fill two fields, tap the page to
  dismiss the keyboard, go back and fix the first. Red on main before this, for exactly the reported reason.

**Split out, so this can close:** a text box narrower than ~46px that is selected but not being edited is
still covered edge to edge by its own resize-handle hit areas. One-tap entry makes it reachable from the
deselected state, which is the common one; the selected-not-editing case after a drag is MOBI-23.

## Review, 2026-09-22 - what was changed and what was decided

An independent review of this fix before it shipped found, and this change answers:

- **Multi-finger, fling-stop and long-press were counting as taps.** A tap is now exactly one finger, on a
  cancelable `touchstart` (the one that merely stops a scroll fling is not cancelable and must not open the
  keyboard), released within 500ms. Plus an ordering bug where a still-live previous gesture's `cancel()`
  wiped the new gesture's flag. Each is pinned by a jsdom unit test in
  `useDraggableElement.tap.test.tsx`, and each test was proven to fail with its fix removed.
- **The offset comment's arithmetic was wrong.** The bar's 4px padding means a button's hit area overhangs
  the bar by 4px, not 8px, so geometry alone should not reach the box. The red-to-green is real, so the
  comment now states what was measured and names the likely mechanism - the browser's touch-target
  adjustment - rather than an explanation that does not add up. Proving it on a device is MOBI-23.

**A product decision, recorded rather than left in code.** One tap on a text box on touch selects it and
opens it for typing; the ticket had sketched "first tap selects, second tap edits". Chosen because a
two-tap sequence reads as a double-tap, which is the browser's zoom, and because it is how every mobile
form behaves. The cost: a box that is open for typing cannot then be dragged, because its textarea owns the
touch - to move a box on a phone, drag it directly, without tapping it first (which works, and is guarded).
The gate is the coarse pointer, so a touchscreen laptop whose primary pointer is fine still uses
double-click; deciding per gesture instead would cover hybrids and is a reasonable follow-up.
