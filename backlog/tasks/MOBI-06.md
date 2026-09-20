---
id: "MOBI-06"
title: "Field-to-field navigation so filling a form never needs aiming"
status: "done"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-04"]
legacy_state: "Open"
---

# MOBI-06 · Field-to-field navigation so filling a form never needs aiming

## Scope and acceptance

**Once the regions are known, the remaining cost of filling a form on a phone is travel, not typing.**
MOBI-04 removes the aiming from one field. A person filling income tax form 101 still has 17 comb runs
on page 1 alone to find, each of which means dismissing the keyboard, pinch-zooming out, locating the
next box, zooming back in and tapping it. The keyboard covers roughly half a phone screen while it is
open, so the field being typed into and the field after it are rarely both visible.

Give the editor a next and previous field move, ordered by the detected regions, that commits the
current element, selects the next one, scrolls it into view above the keyboard, and opens it for
typing. Then a whole page is: tap the first field, type, Next, type, Next.

Where the control lives matters more than usual. `EditorToolStatus.jsx` is the shared status line both
Sign and Redact already render, and the "Stop" chip in it exists because Escape and double-click are
not available on touch. This is the same class of problem and should reuse that surface rather than
inventing a second floating control, and it must stay clear of the toolbar's own 44x44 touch-target
and per-row-cap rules in `SignToolbar.module.css`, which are load-bearing and easy to break by adding
one control.

Ordering is a real decision, not an implementation detail. **Both evidence forms are Hebrew and read
right to left**, so a naive left-to-right, top-to-bottom order walks every row backwards. Derive the
order from the document's own direction rather than hard-coding either one, and record how that
direction is determined.

**Acceptance.** On the committed form 101 fixture, every comb run on a page is reachable by repeated
Next from the first, in the order a person reading that form would fill them, with right-to-left row
order proven on the Hebrew fixture. The target is scrolled fully clear of the on-screen keyboard at a
real phone viewport, which needs a browser test rather than jsdom. Previous returns through the same
order. The current element is committed before the move, so nothing is lost. Escape still unwinds one
level at a time and the arming model is unchanged. The added control does not break the toolbar's
touch-target floor or its wrapped-row cap.

## Where this stands, 2026-09-20

The ordering shipped correct and stayed correct: `orderTypableFields` clusters rows by y and sorts
within a row by a direction-signed edge, off `dominantTextDirection` per page. The Hebrew fixture
test proves the right-to-left row walk this ticket asked for.

The arrows did not. `SignToolbar.module.css` mirrored the two chevron glyphs on `.help[dir="rtl"]` -
the **UI locale's** direction - with a comment arguing that the arrows are chrome and belong to
whoever is operating the app in their own language. That argument does not survive contact with a
Hebrew form on the English edition: the order walks each row right to left while the arrows stay
unmirrored, so the right-pointing chevron moves the cursor left. Shlomi, on the live /sign/ on an
iPhone, once iOS could detect fields at all: "it is opposite direction fwd/back in rtl documents",
and the ruling that settles it - "regardless of the logic of left to right versus right to left, it
just should be visually logic."

So the mirroring is now keyed on the document: `useFieldNavigation` publishes `direction` from the
page the navigation is standing on, `EditorToolStatus` puts it on `.field-nav` as `dir`, and the CSS
matches `.field-nav[dir="rtl"]`. `dir` rather than a bare transform, so the flex row reverses too and
the button on the left both points left and moves left. The labels stay the locale's - a screen
reader should hear "next field", not a compass bearing.

The first cut took the direction per page, and review caught why that is wrong. The two flips
compose, so the rendered picture is *invariant*: `<` on the left and `>` on the right whichever way
the document reads, with only the binding swapped. A per-page direction therefore changes what the
button under a finger does at a page boundary with nothing on screen to say so - tap the left arrow
to cross from an RTL page to an LTR one and the same arrow, unmoved and unchanged, now walks you
back. `EditorToolStatus` already refuses to let this control mount, unmount or move underfoot for
exactly that reason. So `arrowDirection` takes one direction for the whole document, by which way
holds more of its fields, ties to `ltr`. The cost is that a minority page inside a mixed document
reads its rows against the arrow - consistently and visibly, which is the failure worth having.
Taking it per document also deleted rather than patched a real bug the per-page cut had: an element
sitting below every detected field returns `index: null, next: null` from `fieldPosition`, so the
anchor fell through to page 0 and could contradict the step Previous was about to take.

**Why it was not caught.** No test anywhere asserted glyph orientation, the `dir` attribute, or any
case where UI locale and document direction disagree: every fixture fixed one or the other in
isolation, so both halves passed while contradicting each other. That seam is now pinned in
`EditorToolStatus.test.tsx`, `SignToolbar.test.tsx` and `useFieldNavigation.test.ts`. The mirroring
itself is CSS, so jsdom cannot see it and no e2e covers `field-nav` - the rendered result is still
unproven by machine, and was confirmed on the device instead.

**Honest limits of the new rule.** Two, both accepted rather than solved. A row wrap travels against
the arrow - the last field of a row goes to the first of the next - in `ltr` and `rtl` alike; the
chevrons point the way a row reads, not the way every single step moves, and making them literal
would mean a different control (up/down as well as left/right) that nobody has asked for. And a page
whose direction differs from the document's majority reads its own rows against the arrow, which is
the deliberate price of not letting the buttons trade places mid-walk.

**Cheapest thing still missing:** one e2e on an RTL fixture in the English edition, comparing the two
buttons' `getBoundingClientRect().x` against which one is `disabled`. That is the only machine proof
this fix can have, and CLAUDE.md's e2e criterion - "only for what jsdom cannot prove (rendered
rects)" - describes it exactly. Not written here because the pinned Playwright build is not
installed in this environment, so it could only have been written blind.

**Still open on this ticket:** the acceptance clause about scrolling the target clear of the
on-screen keyboard at a real phone viewport, which wants a browser test rather than jsdom.

## When the control shows, 2026-09-20

Shipped present for the whole document once anything was detected, on the reasoning that a
navigation control which came and went as you moved between fields would be worse than one that
simply stayed. That reasoning still holds and is unchanged; what it missed is the state before any
of it starts. Shlomi, on the live /sign/ once the iOS text-extraction fix let a phone detect fields
at all - the first time anyone had seen this control at rest: "those buttons appeared even without
the context of an armed text element."

So the gate is now `hasFields && fillingFields`, where filling means the Text or Date tool is armed,
or a text box is selected. The second half is not optional: tools are one-shot and disarm on the
placement that opens the first field, so a gate on the armed tool alone would take Next away at the
exact moment `type, Next, type` begins. A selected text box is the same context by another name and
is what the person holds for the whole loop.

Within one such spell nothing blinks - `hasFields` still depends only on `formRegions`, and the new
half only on a tool or a selection that a field move does not disturb - so the original reasoning is
preserved where it applied. It also lines the control up with the field hints, which already show
for `text` and `date` only (`PdfWorkspace.tsx`): before this, the hints and the arrows disagreed
about when a document's fields were worth mentioning.

Knock-on worth knowing: `fieldNav` feeds `data-status-active`, and below 559px that hides the
filename in favour of the status line (`ToolShell.module.css`). That now happens only while somebody
is filling fields, rather than for the whole life of any detected document.

## Closed, 2026-09-20

Shipped and in use on a phone. The order comes from the document's own direction, the arrows point
the way that document reads, the control shows only while somebody is filling fields, and the move
commits the current element before it lands on the next. Keyboard-aware scrolling is implemented in
`bringFieldIntoView` (`useFieldNavigation.ts`): a plain `scrollIntoView` measures against the layout
viewport, which does not shrink when the keyboard opens, so where `visualViewport` exists a second
nudge re-centres the field in the space the keyboard actually left.

What is *not* here is browser proof of either rendered behaviour - the arrows' physical orientation
and that second nudge both need real layout, and jsdom has none. That is the whole of what remains,
so it moves to MOBI-15 rather than holding this ticket open.

Follow-on from using it on an iPhone 16 Pro Max: the arrows are correct but badly placed, because
the toolbar that holds them scrolls off the top of the screen while you type. MOBI-16.
