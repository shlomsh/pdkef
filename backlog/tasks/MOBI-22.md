---
id: "MOBI-22"
title: "A field move scrolls twice and lands the field behind the keyboard"
status: "done"
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

## The "residual instantaneous jump" was the test driver

The trace that kept this ticket open - `1400 -> 176` in one frame, then a smooth glide to 441 - was
not the product. **A Playwright `locator.click()` scrolls its target into view before dispatching the
click, and that scroll is instant, not smooth.** The press was being driven from a page deliberately
scrolled ~1000px away from the Next button, so the driver moved the page itself and the app's own
smooth `scrollBy` then ran from wherever the driver had left it.

Evidence, 2026-09-22, with `window.scrollTo`, `window.scrollBy`, `Element.prototype.scrollIntoView`
and `HTMLElement.prototype.focus` monkey-patched in the page to log a stack trace per call
(hypothesis 2 in the brief, which named the culprit outright rather than by elimination):

| from `scrollY = 1400` | trace | app scroll calls logged |
| --- | --- | --- |
| `locator.click()` on Next | `1400` → `221` in one frame, then a glide `221` → `471` | one: `scrollBy({top: 250.5, behavior: 'smooth'})`, logged when the page was **already** at 221 |
| `locator.scrollIntoViewIfNeeded()`, **no click at all** | `1400` → `221` in one frame, then still | **zero** |
| in-page `button.click()`, same position | one glide `1400` → `471`, monotonic | one: `scrollBy({top: -928.5, behavior: 'smooth'})` |

The middle row is conclusive: no click, no app code, same instant 1179px jump. The first two
hypotheses in the brief are both ruled out by the third row - the create path over the same distance
is a single monotonic glide, and the document's `scrollHeight` is a constant 16562 throughout, so
nothing shifts under the deferred scroll.

`setSelectionRange` was never a scroll source either, and the snapshot/restore added around it in
`TextNode.tsx` on that theory has been removed as dead code. Measured on a bare page with a textarea
2000px down, at an iPhone 15 viewport, in **both WebKit and Chromium**: `focus({ preventScroll: true })`
moves the page by 0px and `setSelectionRange` moves it by 0px.

`preventScroll` itself is load-bearing and stays. Removing it and re-running the guard: travel 1367px
for 929px of net displacement, an instant `1400 -> 252` followed by a smooth glide back down to 471 -
the report's "all the way up to the toolbar and then all the way down" reproduced exactly.

## Guard

`src/tools/sign/e2e/field-move-scroll.spec.js`, at 390x844 with `visualViewport.height` faked to 400.
It samples the scroll offset every 25ms across a press and asserts travel equals net displacement
within 2px, that the net move is a real one, and that the field lands whole and centred inside the
band the keyboard leaves. Two moves: a short one with the button on screen (pressed through
Playwright, having first asserted the button is well inside the viewport so no driver scroll can
fire) and the long one from a scrolled-away start (pressed in-page, for the reason above), which also
asserts zero reversals of direction.

Sabotage controls, each run against a real build:

- The shipped `bringFieldIntoView` (no deferral): **red**, net displacement 0 - it scrolled nothing at
  all, which is defect 1 restated.
- `preventScroll` removed from `TextNode.tsx`: **red**, travel 1367 vs net 929.
- Deferral kept but the old mixed absolute+relative scroll restored: **green**. That variant is not
  caught from this starting position, so the spec guards the acceptance line rather than that
  particular defect; defect 1 is what shipped and it is caught.

Measured after: press from the top of the form, `0 → 471`, travel 471, arrival `rect.top = 197.6` in
a band ending at 400. Long move, `1400 → 471`, travel 929, same arrival.

## Acceptance

At a phone viewport with a shrunken visual viewport, a field move is a single monotonic scroll -
total travel equals net displacement - and the arrival rect is centred in the visible band, not
behind the keyboard. Guarded by a Playwright spec that samples scroll position across the move.
