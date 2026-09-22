---
id: "MOBI-24"
title: "A tapped text box on an iPhone opens its session but never its keyboard"
status: "done"
priority: "P1"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-21"]
legacy_state: "Open"
---

# MOBI-24 · A tapped text box on an iPhone opens its session but never its keyboard

Reported in production on 2026-09-22, after MOBI-21 shipped: a text box still could not be typed into on a
phone.

**Cause.** iOS raises the software keyboard only for a `focus()` made while a touch is being handled.
MOBI-21's tap ran `onBeginEdit` inside the `touchend` listener, but that only changed state; the focus
itself was TextNode's effect, which Preact runs after paint, outside the gesture. The box turned editable,
the textarea took focus, and no keyboard came. Playwright's WebKit does not enforce the rule, so every e2e
was green.

**Fix (done).** `DraggableWrapper.tsx`'s `beginEditFromTap` makes the textarea writable and focuses it
synchronously in the tap, then opens the session; TextNode's effect finds it already focused.
`DraggableWrapper.tapFocus.test.tsx` holds the order (red without the fix, green with it).

## Follow-up

The other routes into a session (a box created by tapping a detected field, Next/Previous) still focus from
an effect: MOBI-26.
