---
id: "MOBI-19"
title: "Every adjacent pair in the element toolbar overlaps by 12px, so each button's real hit width is 32px"
status: "in_progress"
priority: "P3"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-16"]
legacy_state: "Open"
---

# MOBI-19 · Every adjacent pair in the element toolbar overlaps by 12px, so each button's real hit width is 32px

## What was measured

Found while proving MOBI-16's acceptance in a browser, at 390x844 with a real form, in the
element toolbar's expanded state. Five pairs overlapped, each by exactly 12.00 x 44.00px:

```
Previous field     x Next field            (fixed here, see below)
Formatting options x Font: Arimo
Decrease font size x Increase font size
Bold               x Italic
Duplicate element  x Delete element
```

Re-measured after the two rules below: 11 buttons, an 80px bar, **4** same-row pairs left and
**0** cross-row.

All five are horizontally adjacent buttons inside the same row. The arithmetic is
`.element-button`'s 28px width (`EditorControls.module.css`) against the 44px hit area
`::before { inset: -8px }` gives it under `@media (pointer: coarse)`, spaced by `.actions`'s
4px `gap` (`EditorElement.module.css`): 28 + 4 = 32px of pitch for a 44px target, so 12px of
each box lies inside its neighbour's.

Both `::before`s are `position: absolute` with `z-index: auto`, so they paint in tree order and
the later sibling wins. The consequence is not symmetric and is worth stating plainly: **the
trailing 4px of every non-last button's visible glyph activates the button next to it**, and
every non-last button's effective hit width is 32px, not the 44px the rule was written to give
it. Buttons either side of a `.divider` are 17px apart and do not overlap, which is why the
damage is patchy rather than uniform.

## What this ticket fixed, and what it left

Measured on the shipped MOBI-16, at 390x844 with the health-declaration fixture, before any of
this: the compact bar had **1** overlapping pair (Previous x Next) and the expanded bar had
**12**, four of them cross-row.

Two rules close the ones that are this control's own, and the arithmetic is the same in both
axes - 28px of button against a 44px `::before` target needs a 44px pitch, so 28 + 16:

- `.quick-field-nav` spaces Previous and Next 16px, so the compact bar - the state a phone fills
  a form in - has **no overlapping pair at all**. That pair mattered most: the later sibling's
  pseudo-element paints on top, so the trailing 4px of the visible Previous fired Next and walked
  the form backwards.
- `.actions` gets `row-gap: 16px` under `(pointer: coarse)`, so a wrapped bar's rows sit at a
  44.00px pitch and **no cross-row pair intersects**.

What is left is the same-row overlap in the **expanded** bar, and it is pre-existing: it predates
MOBI-16, and Redact has it too since Redact never compacts. `src/tools/sign/e2e/
form-field-nav-phone.spec.js` asserts both closed clauses and records the remaining same-row pairs
by name and measurement, so the gap is visible in the suite rather than silently dropped.

## Why it is not a one-line fix

Raising `.actions`'s column gap from 4px to 16px on coarse pointers closes it, but the expanded
text bar is 11 buttons: measured 68px tall over two rows against a 340px cap, 80px once the row
gap above makes its rows clear each other. Twelve gaps going
from 4px to 16px adds ~144px of line, which pushes it to a third row over the document - the
exact cost MOBI-16 existed to remove. Some combination of these is probably needed instead:

- fewer controls in the expanded set (the disclosure already makes a subset defensible);
- a smaller hit-area inset with a larger visible button, so the 44px comes from the glyph rather
  than a pseudo-element that has to overhang;
- per-pair spacing, with the gap only between controls whose confusion actually costs something
  (Duplicate next to Delete is the worst pair on the bar).

## Acceptance

At a phone viewport, in the expanded element toolbar, no two 44px hit boxes intersect in either
axis, and the bar is no taller than it is today. The all-pairs assertion in
`src/tools/sign/e2e/form-field-nav-phone.spec.js` replaces the cross-row one, and its excluded-
pairs comment goes with it.
