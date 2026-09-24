---
id: "SIGN-30"
title: "Double-click locks every Sign toolbar tool"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
phase: "quick-win"
depends_on: []
legacy_state: "Opened 2026-09-22 from Shlomi's report that double-click does not keep a tool armed; closed 2026-09-24"
---

# SIGN-30 · Double-click locks every Sign toolbar tool

## Scope and acceptance

**Double-clicking (or double-tapping) a toolbar tool did not reliably keep it armed**, in Sign and in
Redact (Shlomi, 2026-09-22; reproduced on an iPhone on the income-tax 101 form, and in Redact on his
phone). The invariant is "an armed tool disarms after one placement; double-click locks it", for every
element, on every device.

Acceptance: every toolbar tool stays armed after a double-click or double-tap; arming never moves the
toolbar, on phone and desktop, in Sign and Redact.

## Verified causes

- **Arming moved the toolbar between the two clicks (Sign, regressed by `e114c8c`).** The field
  arrows mount only while filling fields (a product call that stands: no arrows over an idle
  document), and arming Text or Date is that instant. The arrows grew the status row by their own
  44px and by the 93px of width they take from the armed sentence, which on a phone wrapped from 2
  lines to 3. Measured before the fix: 12px on desktop, 28px on a 390px phone (WIP build), about 40px
  with no reservation at all. The second click of a double-click, fired where the button was, missed.
  Fix: while the document has fields and the arrows are absent, `.help` reserves their height and the
  hidden reservation rows give up their width (`reserveFieldNav`, `.help-reserve-nav`,
  `--field-nav-size`/`--field-nav-gap` shared with the arrows), so every state is one height.
- **The armed sentence was too long for a phone.** "Click on a page to place a text box." beside the
  switch and arrows took 3 lines and made the reserved row 72px. Touch now gets its own short form
  (`ToolCopy.actionTouch`, one CSS swap on `pointer: coarse` in the shared `EditorToolStatus`): "Tap to
  add text.", "Tap and drag to draw a line.", in English and Hebrew for Sign and English for Redact.
  Phone row on a form: 44px (the arrows' own height); everywhere else 32px, unchanged.
- **iOS never counts taps (Redact on a phone, and Sign's direct tools).** Measured in the iOS 26
  simulator: every tap arrives as a click with `detail: 1` and `pointerType: "mouse"`, so the lock
  (`e.detail >= 2`) could never fire on an iPhone; the second tap disarmed instead. Fix in the shared
  `toolArming.js` (`useArmTool`): on a coarse pointer, a second tap on the tool the first tap armed,
  within `DOUBLE_TAP_MS` (400ms), locks it; `touch-action: manipulation` on `.toolbar` stops Safari
  reading the pair as zoom. Desktop keeps the OS double-click (`detail`) and nothing else.
- **Menu re-arm dropped the lock (Sign).** `chooseShape` and `handleSelectSavedSignature` dispatched a
  bare `SET_TOOL`. They now keep the lock, gated on the same tool family so a locked Text never makes
  a menu-picked Ellipse locked.
- Checked, not bugs: Sign cannot arm without a saved signature, so a double-click there does nothing;
  creating a signature from the dialog is one-shot by design.

## Verification

Measured on a production build (`npm run build && preview`), toolbar top before vs after arming, every
tool: Sign Text/Date/Symbols/Whiteout/Shapes/Sign on the 101 form and a plain PDF, English and
Hebrew; Redact Blur/Blackout/Whiteout; 1280x800 and a 390x844 touch phone. All 0.0px.

Guards: `e2e/tool-toolbars/toolbar-arm-no-shift.spec.js` (the whole matrix; red at 12px with the
reservation switched off), `toolbar-double-click-lock-timed.spec.js` (250ms human gap, Sign and Redact,
the fields case, and a phone double-tap smoke), `src/tools/sign/e2e/toolbar-double-click-lock.spec.js`
(every Sign tool across two placements, and the two menu re-arms), `toolArming.test.js` (the tap
rule), plus unit tests in `EditorToolStatus.test.tsx` and `SignToolbar.test.tsx`.

Not verified: a real fast double-tap on iOS. The simulator available here cannot tap faster than
about once a second, and Chromium's touch emulation reports `detail: 2` for two quick taps, so no
Playwright spec can reproduce the iOS failure. Needs Shlomi's iPhone on the deployed build. Shapes
and Sign (menu tools) still lock only through `ondblclick`, which the tap rule does not cover.
