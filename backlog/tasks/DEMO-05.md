---
id: "DEMO-05"
title: "Full-height story panels that read as slides without hijacking the scroll"
status: "open"
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
