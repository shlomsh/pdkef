---
id: "SNG-03"
title: "Spike on the iOS 26 Simulator: prove app-owned zoom, a bar that survives the keyboard, and synchronous focus"
status: "retired"
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

Add any question the chosen sketch raises. The 2026-09-25 guidelines review added three more, all in the record:
- (e) text selection under `touch-action`;
- (f) Return interception;
- (g) the router's event model on iOS.

Also measure the bar's budget per context at 320, 375 and 430px (guidelines §2.6).

## Acceptance

- [ ] Each question answered go or no-go on the Simulator, with screenshots, and on Shlomi's iPhone.
- [ ] Every no-go names the fallback taken, and what that changes in SNG-04 and SNG-05.

## Retired

- **2026-09-26:** retired with SNG-02. Its central question, app-owned zoom, was answered by retiring it (SNG-16: zoom stays native). The bar surviving the keyboard and synchronous focus were answered in fill mode itself on the Simulator and Shlomi's iPhone (SNG-15, SNG-17).
