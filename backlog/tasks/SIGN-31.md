---
id: "SIGN-31"
title: "Double-tap locks Shapes and Sign on a phone"
status: "done"
priority: "P2"
epic: "sign-tool-architecture"
phase: "quick-win"
depends_on: ["SIGN-30"]
legacy_state: "Opened and closed 2026-09-24 as SIGN-30's follow-up (Shlomi: make double-tap lock Shapes and Sign on mobile too)"
---

# SIGN-31 · Double-tap locks Shapes and Sign on a phone

## Scope and acceptance

SIGN-30 made a double-tap lock the direct tools on touch (Text, Date, Symbols, Whiteout, and every
Redact tool) with a time rule in `toolArming.js`, because iOS Safari reports every tap as `detail: 1`.
Shapes and Sign are menu triggers and lock through a real `ondblclick` on their wrapper, which a
phone does not reliably send.

Acceptance: on a touch device, two quick taps on Shapes lock the last shape and two on Sign lock the
active signature, with the menu closed afterwards; one tap still just opens the menu; desktop is
unchanged (hover opens, double-click locks).

## What shipped

- `useDoubleTap` (`toolArming.js`): two taps on Shapes or Sign within `DOUBLE_TAP_MS` lock the last
  shape or the active signature and close the menu, only while the menu the first tap opened is still
  open, so "tap, pick, tap to reopen" never locks. Mouse is unchanged (hover opens, `ondblclick` locks).
- On touch their menus open by tap alone. The hover opener fired on the same tap as Floating UI's
  click toggle and opened and shut the menu at once, which is why the first tap on Shapes looked dead.
- The lock shortcut is taught on touch too: the first arm shows ArmHint's bubble with only "Double-tap
  to keep {label} on" (Hebrew too), once per device (`pdf-toolkit:double-tap-hint-seen`), floating
  with `pointer-events: none`, so it costs the phone's row nothing. Desktop keeps its once-per-session
  bubble and the "or double-click" hint.

## Verification

Unit: `toolArming.test.js`, `ArmHint.test.tsx`, and three `SignToolbar.test.tsx` wiring tests (the two
lock tests go red with the wiring removed). Browser (Chromium, 390px touch): one tap opens the Shapes
menu, a double-tap locks and closes it; the bubble shows on the first visit in English and Hebrew and
not on the second. Full `ci.yml` chain green.

Not verified: a real fast double-tap on an iPhone (same limit as SIGN-30: Chromium reports two quick
taps as `detail: 2`, and the simulator here cannot tap that fast). The bubble sits beside the button,
over its neighbours, on both desktop and phone: that is ArmHint's existing placement, left unchanged.
