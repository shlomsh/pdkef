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

**Give the story one screen per beat, so scrolling advances a deck instead of sliding a wall of copy.** Each beat of the DEMO-02 narrative gets a full-viewport panel: the form arrives in a chat, it opens with no install, you fill it in and sign it, you blur the line they don't need, it goes straight back. Use the word "blur" throughout, per DEMO-07, and keep every panel line in the plain language DEMO-04 sets out.

**Implement it with sticky panels, not `scroll-snap`.** This is the finding worth keeping: the reference site that produces this effect (usetape.app) ships **no `scroll-snap` rule at all**. It uses `position: sticky` panels sized in `svh`/`dvh` inside a taller scroll track, so each panel pins while the next scrolls over it. The user's scroll is never intercepted, which is why it feels smooth. `scroll-snap` fights trackpads and momentum scrolling and feels broken on a Mac. Use `100svh`/`100dvh` and never `100vh`: `vh` is wrong on mobile with a collapsing URL bar, and mobile is the case this product exists for.

Pair it with a persistent minimal progress indicator, so a visitor can see how many panels there are and that it ends.

**Placement: decided. The deck goes below the tool, never above it, and it replaces the flat marketing blocks that already sit there.**

Five full-height panels push everything after them five screens down. The nine tool routes are where search traffic lands, and someone who searched "blur pdf online" has intent and wants the tool, so putting five screens in front of it fights this project's own "fast and predictable, minimal clicks to completion" principle and is the most expensive thing that could be done to a converting page. Below the tool it costs that visitor nothing, because they never scroll that far, while a browsing visitor still gets the story. It also stops the deck competing with the single `<h1>` and the FAQ copy for space above the fold, which was the SEO risk this pattern's own first draft flagged against itself.

**One structural constraint, already measured.** `position: sticky` is killed by any ancestor carrying `overflow`, `transform`, `filter` or `contain`. `src/layouts/BaseLayout.astro` is clean, and so are the `html`, `body` and `main` rules in `global.css`, so the pattern works on the real site. But `src/pages/index.astro` carries **eight `overflow-hidden` wrappers**, all on the marketing FeatureCards, which is exactly where someone would instinctively nest this. The sticky track must live outside those wrappers, not inside one. A deck nested in a FeatureCard silently scrolls as a plain stack, with no error anywhere to explain why.

Copy follows DEMO-04's plain language and DEMO-07's vocabulary: blur, never redact.

**Acceptance.** Smooth on a trackpad, a mouse wheel and a touchscreen, with no scroll interception. Correct at 390px with a collapsing URL bar. Under `prefers-reduced-motion: reduce` and with JS disabled it degrades to a plain readable stack with nothing permanently invisible. Marketing copy stays server-rendered (Part II §1.1). Lighthouse Performance and SEO stay at or above 95, and CLS does not regress.
