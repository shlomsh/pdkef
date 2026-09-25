---
id: "SNG-07"
title: "Test the Sign editor where it breaks: WebKit iPhone project and an iOS Simulator release gate"
status: "open"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: ["SNG-04"]
---

# SNG-07 · Test the Sign editor where it breaks: WebKit iPhone project and an iOS Simulator release gate

Today every Sign mobile spec runs on Chromium with CDP touch and pinch, and the `webkit` project in `playwright.config.js` allowlists no Sign spec (`docs/sign-next-gen.md` §2.4).

## Acceptance

- [ ] The Sign mobile specs run in the WebKit iPhone project.
- [ ] A scripted iOS Simulator smoke run gates every change to the mobile editor. It covers:
  - pinch;
  - tap to type with the keyboard up;
  - next field;
  - review;
  - tap outside;
  - undo a move.
- [ ] The run is documented in `.claude/rules/tests.md`.
