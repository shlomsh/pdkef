---
id: "QUAL-01"
title: "--color-primary fails WCAG AA as link text"
status: "open"
priority: "P2"
epic: "site-quality"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# QUAL-01 · `--color-primary` fails WCAG AA as link text

## Scope and acceptance

**CLAUDE.md commits to WCAG 2.1 AA, 4.5:1 for body text, and the accent colour does not meet it.**
`--color-primary` is `#3e7c8d` and measures **4.42:1** against `--color-bg` (`#f4f9fa`). That is
close enough to look fine and far enough to fail, which is why it has survived a retheme and several
review passes. Nobody notices 4.42:1 by eye. It is a problem for exactly the visitors this product
says it is for: "accessible to everyone" is one of the four design principles and "no gatekeeping on
ability" is written into the accessibility section.

**The fix is not simply darkening the token, and that is the whole difficulty.** `--color-primary`
does three different jobs: it is the text colour of links, it is the *background* of primary buttons
(where the contrast that matters is against white button text, and darkening only helps), and it is
the focus ring (where the 3:1 non-text threshold applies, which it already clears). Darkening the one
token far enough to fix links also darkens every button and every ring, which is a visible change to
the whole Sea Glass register the owner has just decided to keep (DEMO-06).

So decide between the two shapes explicitly rather than reaching for the first one:

1. **Darken `--color-primary` itself** until link text clears 4.5:1, and accept that buttons and rings
   move with it. Simplest, one token, but it is a palette change.
2. **Introduce a separate `--color-primary-text`**, used only where the accent is drawn as text, and
   leave `--color-primary` alone for surfaces and rings. Preserves the register exactly, at the cost
   of one more token that every future contributor has to pick correctly.

Whichever wins, the audit is the real work: find every place the token is currently used as text, as
opposed to as a background or a border, across `src/**/*.astro`, the CSS Modules, and `global.css`.
`text-[var(--color-primary)]` is the obvious spelling, but the editor modules also set `color` from it
directly.

Check the neighbours while you are in there. `--color-muted` and `--color-muted-light` have never been
measured either, and `--color-muted-light` (`#a4ccd9`) is plainly decorative rather than readable, so
confirm nothing renders body text in it.

**Acceptance.** Every accent-coloured text run measures at least 4.5:1 against the surface it sits on,
and large text at least 3:1. Buttons keep at least 4.5:1 for their label against their fill. Focus
rings keep at least 3:1. The decision between the two shapes above is recorded in this ticket with its
reasoning. Measured numbers, before and after, not assertions.
