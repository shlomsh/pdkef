---
id: "DEMO-05"
title: "Full-height story panels that read as slides without hijacking the scroll"
status: "done"
priority: "P2"
epic: "landing-story-demo"
phase: "later"
depends_on: ["DEMO-01"]
legacy_state: "Open"
---

# DEMO-05 · Full-height story panels that read as slides without hijacking the scroll

## Scope and acceptance

**Scope note: the hero in DEMO-02 is now scroll-driven, so it consumes this pattern directly.** This ticket stays open as the owner of the sticky mechanics, the placement decision and the `overflow-hidden` constraint below, all of which DEMO-02 depends on. It is no longer a separate storytelling surface competing with the hero.

**Give the story one screen per beat, so scrolling advances a deck instead of sliding a wall of copy.** Each beat of the DEMO-02 narrative gets a full-viewport panel: the form arrives in a chat, it opens with no install, you fill it in and sign it, you blur the line they don't need, it goes straight back. Use the word "blur" throughout, per DEMO-07, and keep every panel line in the plain language DEMO-04 sets out.

**Implement it with sticky panels, not `scroll-snap`.** This is the finding worth keeping: the reference site that produces this effect (usetape.app) ships **no `scroll-snap` rule at all**. It uses `position: sticky` panels sized in `svh`/`dvh` inside a taller scroll track, so each panel pins while the next scrolls over it. The user's scroll is never intercepted, which is why it feels smooth. `scroll-snap` fights trackpads and momentum scrolling and feels broken on a Mac. Use `100svh`/`100dvh` and never `100vh`: `vh` is wrong on mobile with a collapsing URL bar, and mobile is the case this product exists for.

Pair it with a persistent minimal progress indicator, so a visitor can see how many panels there are and that it ends.

**Placement: decided, and reversed from this ticket's first answer. The demo goes above the documentation, as the second screen.**

Concretely: the demo sits immediately after the existing full-height first screen and before the first `FeatureCard`. It does **not** go between the hero and the dropzone. `index.astro` composes hero, dropzone and tool grid as one deliberate unit (`min-h-[calc(100svh-3.5rem)]`, `flex-col justify-center`, and the grid pinned with `mt-auto`), so anything inserted inside that block pushes the tool grid off the screen and breaks reason 4 below.

The four reasons, as the product owner stated them:

1. **The app is new and in market-penetration phase**, so most visitors right now are first-time visitors. The page should be built for the person who has never seen it.
2. **The "/" page is a router, not a tool.** Google indexes the individual tools directly (sign, redact, compress and the rest) and users should arrive at them the same way. So the home page's job is converting a visitor into a *tool user*, which it does better with a demo than by being a bare dropzone wired to the Sign tool alone.
3. **Documentation plus demo is the right register.** It should not read as a marketing pitch. Showing the thing working, next to material that explains it, is the sweet spot.
4. **Keep the macOS feel.** The tool grid at the bottom of the first screen reads as a macOS dock, and an experienced visitor uses it to jump straight to the tool they came for. That row has to stay on the first screen.

**Reversibility is part of the decision.** Placement must stay a one-line move in `index.astro`, so the demo has to be a self-contained component that depends on nothing about where it sits. The decision is a judgment about today's traffic mix, and today's traffic mix will change.

**Superseded reasoning, kept because it is still the thing to re-check when traffic changes.** This ticket originally decided the opposite, that the deck goes below the tool, on the grounds that the nine tool routes are where search traffic lands and a visitor who searched "blur pdf online" has intent and wants the tool, so screens of story in front of it fight the project's own "fast and predictable, minimal clicks to completion" principle. That argument is still correct **for the tool pages**, and it is what should govern if the demo is ever reused on one. It loses on the home page specifically because the home page is a router rather than a tool, which is reason 2. If organic traffic to "/" ever comes to be dominated by returning users, re-open this.

**Considered and deferred: swapping the demo and the dropzone on returning visitors.** The proposal was to show the demo when the dropzone is empty and the dropzone when it has recent work. The signal already exists and is cheap: `FileDropzone` reads `readDraftMeta()` synchronously precisely so its first render already knows, and shows a `ResumeDraftCard` when a sign or redact draft is saved.

It is deferred because the demo and the dropzone have opposite rendering constraints. `FileDropzone` is `client:only`, so it ships no build-time HTML at all, which is why `index.astro` reserves `min-h-[333px]` against layout shift. The demo is the reverse: all of its copy must be server-rendered or it stops counting as the SEO surface (Part II §1.1). So the demo is always in the document, and hiding it after hydration means a returning visitor sees it flash and then collapse by several screens, which is precisely the layout shift that reservation exists to prevent. Deciding before first paint needs a synchronous inline script, and hand-hashing an `is:inline` script for CSP is documented in CLAUDE.md as fragile and silently breakable.

The first screen already sorts the two audiences without any of that machinery: a returning visitor with a draft meets their resume card in the first viewport and never scrolls, while a new visitor meets the empty dropzone, the dock, and then the demo. If a true conditional is still wanted later, the safe shape is to **collapse rather than remove**, via a `has-draft` class on `<html>` written by the same bundled script that already registers the service worker, driving a CSS `max-height`. That keeps the markup crawlable and the CSP posture intact.

**One structural constraint, already measured.** `position: sticky` is killed by any ancestor carrying `overflow`, `transform`, `filter` or `contain`. `src/layouts/BaseLayout.astro` is clean, and so are the `html`, `body` and `main` rules in `global.css`, so the pattern works on the real site. But `src/pages/index.astro` carries **eight `overflow-hidden` wrappers**, all on the marketing FeatureCards, which is exactly where someone would instinctively nest this. The sticky track must live outside those wrappers, not inside one. A deck nested in a FeatureCard silently scrolls as a plain stack, with no error anywhere to explain why.

Copy follows DEMO-04's plain language and DEMO-07's vocabulary: blur, never redact.

**Acceptance.** Smooth on a trackpad, a mouse wheel and a touchscreen, with no scroll interception. Correct at 390px with a collapsing URL bar. Under `prefers-reduced-motion: reduce` and with JS disabled it degrades to a plain readable stack with nothing permanently invisible. Marketing copy stays server-rendered (Part II §1.1). Lighthouse Performance and SEO stay at or above 95, and CLS does not regress.

## What landed

Commits d2e0609 (the placement decision and its reasoning, mirrored into CLAUDE.md's "What the home
page is for" section) and 021de65 (the mechanics, which DEMO-02's hero demo consumes directly).

The pattern is as specified: `position: sticky` stages inside taller tracks measured in `svh`, no
`scroll-snap` anywhere, and progress recomputed from scroll position on every frame rather than
accumulated. That last detail is what makes scrubbing backwards genuinely un-fill the form, and it was
verified bit for bit: scrolling forward to a given offset and then returning to it reproduces the same
progress value to the last decimal place, which is only possible if nothing is being accumulated.

The `overflow-hidden` warning in this ticket turned out to matter in practice. `index.astro` carries
eight `overflow-hidden` FeatureCard wrappers, which is exactly where the demo would instinctively be
nested, and any of them would have killed the sticky behaviour with no error anywhere. The demo is
mounted as a direct sibling after the first-screen wrapper instead, and `HeroDemo.astro` and
`index.astro` both carry a comment saying why.

**One thing this ticket specified and did not deliver:** the persistent minimal progress indicator. It
was closed on the strength of the sticky mechanics and the placement decision, both of which shipped,
but the indicator was never built. Carried into DEMO-02's remaining work rather than left implied here.

## Reopened: the owner chose option C and it is not built

The mechanics and the original placement shipped, and the progress indicator this ticket specified was
finally built (commit 6a71f4d). But the placement question came back, because the demo as shipped sits
below the first screen and the owner had asked for it above the dropzone.

He was shown four options drawn to scale against an 800px viewport and **chose option C**. The
arithmetic behind them:

- 800px viewport, minus 56 app bar, minus 227 hero, minus 145 tool dock, minus 35 frame margins, leaves
  **337px** for the slot between the hero and the dock.
- The demo needs about **410px** to stay legible; below that the filled values clip at 390px width.
- So the dock staying on the first screen and the demo living above the dropzone cannot both hold at
  13-inch height. Option C closes the 73px gap by cutting the hero from about 227px to about 154px, and
  swaps the demo for the dropzone when the visitor has a saved draft.

**He also asked for a second thing that may replace it: try the two-column hero usetape.app uses, and
use it if it looks better.** That is worth doing first, because it changes the arithmetic rather than
paying it. Stacked, the demo and hero compete for one vertical budget. Side by side they share it, and
the demo can exceed 410px without the dock moving at all.

Two things that are now known and should not be rediscovered:

- **The conditional swap is feasible synchronously.** `src/editor/workspace/draftStore.js` mirrors "a
  draft exists for this tool" into localStorage (`hasDraftHint`, `readDraftMeta`) precisely so it can be
  read before paint. IndexedDB holds the bytes and is async; the hint is not. The decision must be made
  from a **bundled** script writing a class on `<html>`, never `is:inline`, and it must collapse the demo
  rather than remove it, since its copy is the SEO surface.
- **The app bar is `sticky top-0 z-20`, 56.5px.** Any sticky panel pinned at top:0 puts its own first
  56px underneath it, invisibly. `--herodemo-app-bar` in HeroDemo.module.css exists for this.

Three attempts at this failed for environmental reasons rather than design ones: two to session limits,
one to a network error, and one agent spent its whole run delegating instead of implementing.

## Resolved: variant T, and option C turned out to be unnecessary

Commit 2cb8d05. The owner chose option C and also asked to see the usetape.app two-column layout first,
"if it looks better". It does, by a wide margin, and it makes option C moot rather than winning on
taste.

**The reason is structural.** Every version of this argument was a fight over one vertical budget.
Stacked, the hero, the dropzone, the dock and the demo all draw from the same 800px, which is why the
slot came out at 337px against a 410px legibility floor, and why option C had to buy the missing 73px
by cutting the hero. Side by side, the demo draws from the column's full height instead, so there is
nothing to buy.

Measured at 1512x800, against a stacked slot that never exceeded 337px:

| | Stacked (before) | Variant T |
| --- | --- | --- |
| Demo panel height | 337 (needs 410) | **562** |
| Hero height | 194, would drop to ~154 under option C | **194, untouched** |
| Dock bottom edge | 777 against an 800 fold | **777, unchanged** |
| Demo above the fold | no | **yes** |

Both sticky layers hold: the left column pins at 56 and the demo's own panels at 0. Below 1024px it is
a plain block and everything falls back to the stacked order phones already had, verified rather than
assumed: grid computes to `block`, the left column to `static`, the demo's title card returns, no
horizontal overflow.

**Two things are load-bearing and both fail silently.** Grid items stretch to the row height by
default, and this row is the demo's ten screens, so the left column needs `align-items: start` and its
own height or sticky has nothing to move within. And nothing in this subtree may grow `overflow`,
`transform`, `filter` or `contain`; each creates a containing block that kills `position: sticky` on
every descendant with no error anywhere, and there are now three sticky layers here: the app bar, the
left column, and the demo's panels.

**Two measurements decided details that would otherwise have been taste.** At a 1.05fr left column the
dock came out 794px wide, wrapped to two rows and ended at 910 on an 800px viewport, which is precisely
the failure this layout exists to prevent, so the column carries a 940px floor (nine 80px tiles and
eight 20px gaps is 880px before padding). And the demo's own full-screen title card is hidden in this
layout, because beside the hero it says the same thing twice in one eyeline and costs a whole screen
before the phone appears.

**The conditional swap from option C was not built and is not needed here.** It existed to decide which
single thing occupied one slot. With two columns there is no contest: a returning visitor meets their
resume card in the dropzone and the demo at the same time. The groundwork is still recorded above if a
future layout ever needs it.

Reverting is deleting the wrapper in `index.astro` and moving `<HeroDemo />` back below
`<OfflineProof />`, which is the cheap reversal this ticket has always required.
