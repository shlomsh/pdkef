---
id: "SNG-07"
title: "Test the Sign editor where it breaks: WebKit iPhone project and an iOS Simulator release gate"
status: "done"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: ["SNG-04"]
---

# SNG-07 · Test the Sign editor where it breaks: WebKit iPhone project and an iOS Simulator release gate

Today every Sign mobile spec runs on Chromium with CDP touch and pinch, and the `webkit` project in `playwright.config.js` allowlists no Sign spec (`docs/sign-next-gen.md` §2.4).

## Acceptance

- [x] Sign's phone regressions run in the WebKit iPhone project (`fill-mode-phone-regressions.spec.js`,
  83734540). The older Chromium mobile specs stay where they are; SNG-06 retires them with the old editor.
- [x] A scripted iOS Simulator run, `npm run gate:ios` (`scripts/ios-gate/`). It covers:
  - tap to type with the keyboard up, and no zoom out on focus;
  - typing;
  - the keyboard's Next;
  - tap outside;
  - pinch, then Next: MANUAL for now (SNG-20).
- [x] The run is documented in `.claude/rules/tests.md`.

## Result (2026-09-26)

Three runs: 4 passed, pinch MANUAL. Pinch itself works (2.6x), but zoomed in the keyboard's Next could
not be found. Review is ruled out by `docs/sign-tool-product-decisions.md`. Undo a move, the toolbar
and the font sheet stay in Playwright: its WebKit project applies the same no-focus-on-button-tap rule.
The gate runs by hand, not on every change: a Simulator run needs Xcode and minutes, not seconds.
