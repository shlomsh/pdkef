---
id: "SITE-44"
title: "App bar: the tool crumb gives way instead of shrinking to a letter"
status: "in_progress"
priority: "P2"
epic: "polish"
horizon: "now"
depends_on: []
---

# SITE-44 · App bar: the tool crumb gives way instead of shrinking to a letter

*Seen 2026-10-27 in a QA pass on /scan-to-pdf/ (SCAN-02), at 320px: the crumb after the brand read "S" with no
ellipsis and the shield chip pressed against it; at 390px it read "Scan to P…". The bar is shared by
every tool page, so it is every page's problem.*

## Cause (measured in Chromium against `astro dev`, 700px tall)

`AppBar.astro` puts the crumb between the brand and the on-device badge in one flex row. The badge and
the chips are `shrink-0` / `flex: none`, so the crumb is the only thing that gives. Its room is the
viewport minus a constant (brand, 2rem badge, three 2rem chips, four gaps), and that constant leaves
almost nothing on a phone. Name width available to "Scan to PDF" (80px to show it whole):

| viewport | 320 | 360 | 375 | 390 | 414 | 721 | 744 | 768 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before | 7.9px | 47.9px | 62.9px | 77.9px | 79.7px | 31.1px | 54.1px | 78.1px |

The second squeeze is 721 to about 765px: the chips get their labels back at 721, the badge shows its
word again, and the crumb is the one thing left to pay for it. `TrustChips.astro`'s header says as
much ("the bar's breadcrumb is what gives way") but gives it nothing to give way *to*: the name is
cut to a letter or two, which is neither a name nor an ellipsis.

## Fix

The crumb sits in a flex-1 wrapper that is its own inline-size container, and the crumb hides itself
when that wrapper is narrower than the room for a readable name (the chevron plus about 4.5rem of
text). The wrapper's width is exactly what the row leaves over, so the rule needs no breakpoints and
holds for any tool name, any locale and any chip width: the name shows with an ellipsis while it has
room to be read, and the brand and chips are all that is left when it does not. The tool name is the
page's `<h1>` right below the bar either way.

## Acceptance

- At 320, 360, 375, 390, 744 and 768px, on the longest tool names, the crumb is either hidden or shows
  at least 4rem of its name, ending in an ellipsis when cut. It never touches the brand or the badge,
  and the page has no horizontal scroll.
- Where there is room (480px up) every tool name still shows whole.
- Guard: `e2e/app-bar-crumb.spec.js`, with a checked sabotage control.
