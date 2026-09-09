---
id: "QUAL-01"
title: "--color-primary fails WCAG AA as link text"
status: "done"
priority: "P2"
epic: "site-quality"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-09-09"
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

## Outcome (2026-09-09)

The second shape won: `--color-primary-text: #397281` now owns readable accent foregrounds, while
`--color-primary: #3e7c8d` stays on button fills, borders and other surfaces. This keeps the Sea Glass
register and makes the semantic choice explicit in both Astro utilities and CSS Modules. The default
link rule and every former `color: var(--color-primary)` / `text-[var(--color-primary)]` foreground
were migrated; direct backgrounds, borders, strokes, fills and accent controls were left on the
surface token.

The homepage refresh is covered by the same global split rather than another local exception. Its
accent heading now measures 4.80:1 on `--home-workspace`, up from 4.18:1. The handwritten annotation
ink moved from `#167a98` (4.38:1 there) to the global `--color-annotation: #147691` (4.64:1).

### Measured contrast

| Pair | Before | After |
| --- | ---: | ---: |
| Accent text on page background `#f4f9fa` | 4.42:1 | 5.07:1 |
| Accent text on white | 4.70:1 | 5.39:1 |
| Accent text on primary soft `#eef6f8` | 4.29:1 | 4.92:1 |
| Accent text on primary tint `#e6f1f3` | 4.08:1 | 4.68:1 |
| Accent text on homepage aqua `#e4f5f7` | 4.18:1 | 4.80:1 |
| White label on primary button | 4.70:1 | 4.70:1 |
| White label on primary hover | 3.71:1 | 5.39:1 |
| White label on primary active | 5.78:1 | 5.78:1 |

The neighbour audit found five readable uses of `--color-muted-light`, not zero: the airplane-mode
invitation, page-grid hint, undo timestamp, dropzone subtext and editor shortcut hint. Those now use
`--color-muted`. The audit also found existing muted copy on the darker sunken surface, where the old
`#54707c` reached only 3.83:1, so the global muted token moved to `#4a6570`: 4.51:1 on sunken,
5.84:1 on the page background and 6.20:1 on white. Remaining muted-light uses are decorative
marks/icons, borders, an inactive-control label exempt from text contrast, and the off-state switch
track.

The focus audit also corrected an assumption in the original scope. The global solid outline already
passed, but module focus states using `--shadow-focus` inherited the 35%-opacity decorative ring and
composited to only 1.46-1.59:1. `--shadow-focus` now uses the solid primary token (3.41:1 even against
the darkest Sea Glass surface); `--color-primary-ring` remains soft for decorative shadows.

`src/styles/colorContrast.test.js` locks all of these token/surface pairs; its 18 assertions pass. The
2,099-test unit suite and typecheck passed against the QUAL-01 change set before subsequent unrelated
working-tree edits. The production build, CSS/class/duplication checks, SEO check, CSP check and
page-weight check pass, and an uncached production render of `/` loads with the refreshed hero and
shared theme intact.
