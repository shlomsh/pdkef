---
id: "SNG-03"
title: "Spike on the iOS 26 Simulator: prove app-owned zoom, a bar that survives the keyboard, and synchronous focus"
status: "open"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: ["SNG-02"]
---

# SNG-03 · Spike on the iOS 26 Simulator: prove app-owned zoom, a bar that survives the keyboard, and synchronous focus

Build a throwaway page, not product code. The questions and their fallbacks are in `docs/sign-next-gen.md` §8:
- (a) two-finger touches reach JS while one-finger pans stay native;
- (b) the fixed top bar stays in view with the keyboard up;
- (c) a newly created field gets the keyboard;
- (d) pdf.js memory at 3x zoom.

Add any question the chosen sketch raises.

## Acceptance

- [ ] Each question answered go or no-go on the Simulator, with screenshots, and on Shlomi's iPhone.
- [ ] Every no-go names the fallback taken, and what that changes in SNG-04 and SNG-05.
