---
id: "MOBI-22"
title: "A field move scrolls twice and lands the field behind the keyboard"
status: "in_progress"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-16"]
legacy_state: "Open"
---

# MOBI-22 · A field move scrolls twice and lands the field behind the keyboard

## What happened

Shlomi, using Previous/Next on an iPhone: "there is a hugh jump, instead of rolling nicely to the next
neighbor element ... the screen scrolled all the way up to the toolbar and then all the way down to
the next element so basically that move effect is very blurry and confusing."

## Measured

At 390x844 with the visual viewport shrunk to 400px, the way an open keyboard shrinks it (the layout
viewport stays 844, which is the whole reason `bringFieldIntoView` has a second step at all):

- **Before:** the field ended at `rect.top = 461` in a band that ends at 400 - i.e. **behind the
  keyboard**. iOS then scrolled again by itself to put the caret above it. That browser-driven second
  move is a large part of what reads as the jump.
- **After:** `rect.top = 197`, centred in the visible band.

Two defects, both in `bringFieldIntoView` (`useFieldNavigation.ts`):

1. **It ran before the element existed.** Every caller invokes it in the same tick as the dispatch
   that creates the box, so on the create path `querySelector` returned null and it scrolled nothing;
   what actually moved the page was the browser's scroll-on-focus. Now deferred two animation frames.
2. **It mixed an absolute scroll with a relative one computed from a stale rect.**
   `scrollIntoView({ block: 'center' })` is asynchronous when smooth, so the `getBoundingClientRect()`
   on the next line still read the pre-scroll position; the keyboard-aware nudge then either no-opped
   or double-counted the distance. Now one relative `scrollBy`, computed from the current rect and
   centred on the **visual** viewport rather than the layout one.

`TextNode.tsx` also focuses with `preventScroll` now, so the browser does not add its own jump on top.

## Still open

A residual instantaneous jump remains in the harness before the smooth glide: `1400 -> 176` in a
single frame at ~73ms, then a glide to 441. It was assumed to be `setSelectionRange` pulling the caret
into view, and snapshotting/restoring the scroll position around focus **did not remove it**, so that
explanation is wrong and the source is not yet known. Do not close this ticket on the strength of the
numbers above; the motion is better and correctly centred, but it is not yet one clean move.

Worth checking next: whether the jump is a layout shift as the new box mounts (it would move the
measured rect under the deferred scroll), and whether navigating between two boxes that both already
exist shows it at all.

## Acceptance

At a phone viewport with a shrunken visual viewport, a field move is a single monotonic scroll -
total travel equals net displacement - and the arrival rect is centred in the visible band, not
behind the keyboard. Guarded by a Playwright spec that samples scroll position across the move.
