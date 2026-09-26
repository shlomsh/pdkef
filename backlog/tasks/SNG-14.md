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

**Measured on the iOS 26.2 Simulator (iPhone 17), 2026-09-25.** Shlomi then tried it on his iPhone and on
desktop Chrome (below).

### The three questions

- **The stops.** In the final setup, iOS's ∨ visits every text field in reading order, across both pages.
  Fields added by a tap join the order at once (∧ from a new field went back to the earlier one). Real
  checkboxes are never stops: from the last page-1 text field, ∨ skipped all 14 checkboxes and went to
  page 2. This matches WebKit's source, where `isAssistableElement` covers text fields, textareas,
  selects and contenteditable only.
- **The keyboard.** It stayed up across every ∨ and ∧ hop, and when a tap added a field while typing.
- **The view.** Each field lands about a third of the way down the visible area, above the keyboard, and
  Safari never moved the page on its own ("Safari moved 0" on every hop).

### What it takes (each one failed first)

- **Fields must be hittable at their centre.** With `pointer-events: none` on the invisible fields, both
  arrows were greyed out. WebKit's `nextAssistableElement` hit-tests the next field's centre and skips it
  as "obscured" when the hit lands elsewhere.
- **The document itself must scroll.** With the zoomed page moved by transforms inside a fixed frame, ∨
  went 1, 3, 6 and then greyed out with 10 fields left: every field whose centre was off-screen was
  skipped. A native scroll container inside a fixed frame failed the same way (1 to 3). With the window
  as the scroller, every field was reachable.
- **Lock the page scale both ways.** With only `maximum-scale=1`, iOS zoomed the page out to about 0.6
  when ∨ reached the wide Address box, and the next hops landed wrong. Adding `minimum-scale=1` stopped
  it.
- **Frame against the visual viewport.** With the keyboard up on iOS 26, `window.scrollY` equals
  `visualViewport.offsetTop`: scrolling moves the visible area. Adding `offsetTop` into the target
  counted it twice and left the Email field behind the keyboard bar.

### Also learned

- The bar above the keyboard can't be changed or extended by a page (WebKit source, the accessory view
  lives in the UI process). Anything contextual goes in our own chrome when the keyboard is down.
- `inputmode="none"` keeps the arrows and hides the keyboard (WebKit source, unverified on device).
- In the Simulator, a tap on the status bar scrolls the page to the top, as on a phone.
- Our first page had four more bugs from a zero-context review, all fixed: a cancelled touch counted as
  a tap; a hop didn't stop a fling; tap-added fields could fall out of row order; a stale "via tap"
  label.

### Shlomi's run on his iPhone and desktop Chrome, 2026-09-26

Each item is what he hit, then what changed on the test page.

- **A multi-line box stranded him.** On Address, the keyboard's return key became a plain return, so
  "next" was gone. Now each printed line is its own single-line field. The return key reads "next" on
  every field and "done" on the last.
- **Invisible detection doesn't work on a phone.** With no hint, a slightly-off tap missed the spot and
  created a free field above or below it. The tap tolerance was 10 px, and a whole line is about 9 px
  tall at the zoomed-out view. Now:
  - detected spots show a faint frame and a trace of fill at rest;
  - a tap within half a fingertip (22 px) of a spot, or on the printed label just above it, goes to that
    spot;
  - between two rows, the field whose label was tapped wins.
- **Hints must be quiet but answer back.** A cream band read as a bright highlight, and ghost carets
  with lit lines weren't it either. His model: a faint frame at rest, and a "droppable" look when the
  mouse hovers near a spot, or the finger touches down near one. That look shows what the armed tool
  would fill. With nothing detected nearby, there is no preview.
- **The default tool must be visible.** A tap wrote text while nothing looked armed. Now Text shows as
  chosen in the bar. Tick and cross can be chosen and stay chosen. Date fills today's date once, then
  goes back to Text.
- **A slip must be undoable.** Esc did nothing, and a click away from any spot while typing made yet
  another field. Now:
  - Esc ends typing;
  - a tap away from every spot while typing only finishes typing;
  - an empty free field disappears when left;
  - the bar stays visible on desktop, and hides only on touch screens while the keyboard is up.
- **Answers that are marks on printed words** ("I am / am not"): circling or striking one needs
  production's ellipse and line. A phone-friendly way to explore: pick circle or strike, then tap the
  word.
- **Formatting while typing:** no controls in the keyboard's bar (a page can't add any). Good defaults
  (the size fits the line, the direction follows the script) and production's text controls when the
  text is tapped directly.
- **Everything else is production's.** Signature, rectangle, ellipse, line, border thickness and
  colour, text formatting and undo already exist. The test page won't rebuild them; the next step
  brings the model into the production editor.

## Acceptance

- [ ] Each of the three questions has an observed answer on the Simulator and on a real iPhone, recorded
  here.
- [ ] The plan and guidelines carry the result. The pending hop-model edits get a second pass.
