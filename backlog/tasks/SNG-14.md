---
id: "SNG-14"
title: "Spike: the keyboard's own ∧ ∨ hop between invisible text fields over the page"
status: "in_progress"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: []
---

# SNG-14 · Spike: the keyboard's own ∧ ∨ hop between invisible text fields over the page

*Filed 2026-09-25.* Shlomi asked whether iOS's own chevrons, the ∧ ∨ and Done above the keyboard, could be
the hop control. They are there whenever a person types on a web page, and a page cannot hide them, so our
own arrows would be a second copy taking page space.

Detection's score on a new page cannot be known, so the design must hold at any score: with detection on,
nothing may be slower than with it off.

**The idea.** Every likely writing spot is a real, invisible text field, in reading order. The platform's
own next and previous do the hopping: iOS's chevrons, Tab on desktop, the Next key on Android. Detection
does two jobs only:
- the order the arrows follow;
- where a tap lands.

A wrong guess costs one extra ∨ and never reaches the file. A missed spot is one tap, and it joins the
order.

## What the throwaway must prove, on iOS Safari (the Simulator and a real iPhone)

1. **The stops.** The chevrons stop at our fields, in our order, across pages. Record whether they skip tick
   boxes.
2. **The keyboard.** It stays up between hops, and when a tap adds a field.
3. **The view.** It doesn't jump:
   - Safari's own scrolling doesn't fight our camera when a chevron moves the cursor;
   - the page never zooms by itself.

Run each on the same form at three detection levels: all found, half wrong, none found.

## Where

A standalone page outside the app, in the session scratchpad, served on the local network. Nothing in
`src/` changes.

## Findings

(to fill)

## Acceptance

- [ ] Each of the three questions has an observed answer on the Simulator and on a real iPhone, recorded
  here.
- [ ] The plan and guidelines carry the result. The pending hop-model edits get a second pass.
