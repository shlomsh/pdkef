---
id: "QUAL-17"
title: "The home dock joins the launcher's post-hydration shift, and nothing in CI watches the landing path"
status: "in_progress"
priority: "P2"
epic: "site-quality"
phase: "near-term"
depends_on: []
---

# QUAL-17 · Landing-path CLS, measured and guarded

*Filed 2026-09-21, from Shlomi's read of the Vercel Speed Insights RES chart (the P75/P90
percentile lines turning down over 2026-09-19 to 2026-09-21).*

## What the investigation found

The dashboard read that prompted this is weak evidence on its own: the headline RES was 99
("Great"), the turn-down sits at the right-hand edge, and the rightmost point was a partial day
on the low-volume traffic `ANALYTICS.md` describes. It is recorded here as the prompt, not as
the finding. What follows was measured on built output, not read off the chart.

Three builds were rebuilt and measured with one methodology: `ebd8053` (2026-09-18, before that
week's home-page work), `e32a926` (2026-09-19) and `d487d67` (2026-09-20, `origin/main`).
Pixel 5 profile, 4x CPU throttle, 1.6Mbps/150ms, median of three runs per cell.

**Not the cause, ruled out with numbers:**

- First-load weight is flat. `/` measures 261,642 then 261,570 then 261,786 bytes brotli of
  eagerly-referenced JS across the three builds; `/sign/` moves 324,547 to 326,762. Nothing
  went eager, and `test:weight` and `test:lazy-modules` both pass.
- A fresh first visit does not shift and does not paint late, on any of the three builds:
  CLS 0.0000 and LCP equal to FCP at 596-812ms on `/`, `/sign/`, `/redact/` and `/merge/`,
  in portrait and in landscape. The static shell is doing its job.

**The regression, isolated to one commit and one element.** With six recents seeded into the
localStorage index at 393x851:

| build | CLS | the entry's own source list |
| --- | --- | --- |
| `ebd8053` (09-18) | 0.0092 | `BUTTON._tile_`, `::before` |
| `d487d67` (09-20) | 0.0144 | `BUTTON._tile_`, `::before`, **`NAV.home-dock`** |

**Caveat on those two numbers, which matters.** They come from a standalone static server, not
from `astro preview`. Measured again through `astro preview` - the surface CI uses - the same
`d487d67` build reports 0.00000 at 393x851 and 0.00906 at 851x393, with `NAV.home-dock` as the
only source outside the launcher. Neither server compresses, so compression is not the
difference, and it has not been isolated. Read the 0.0092/0.0144 pair as a like-for-like A/B
under a harsher transfer than production (it is the same harness on both sides, which is what
makes the comparison sound), and the preview figures as the CI-comparable absolutes. The dock's
entry into the source list reproduces on both surfaces; that is the finding.

One shift on each build, at the same moment (5.30s and 5.37s), from the same cause: the
launcher's three-column grid gaining rows when `FileDropzone`'s mount effect reads the recents
index. The only difference is that the dock now moves with it.

That is `ef8aa76` ("Fix the home page on a phone held in landscape"), which changed `.home-hero`
from `height: calc(100svh + 1216svh)` to `min-height` with `min-content` header and dock rows so
that a landscape phone would stop crushing the dock from 111px to 34px. It fixed a visibly
broken page and the trade was not wrong; what was missed is that the growth it allowed is also
the growth a returning visitor's recents trigger, so the dock is pushed instead of the growth
being absorbed. `.claude/rules/home-page.md` asks for exactly this re-measurement ("0.0211 on
the current grid; re-measure if the grid changes") and the grid changed in the same commit.

Landscape (851x393) does not show it: 0.0093 before, 0.0091 after. The `max-height: 560px`
block in that commit zeroes `.home-workspace`'s `min-height: 13rem` CLS floor, which looked like
a second defect, and measuring it says it is not one - a first visit at that height is 0.0000 on
both builds.

**Two real defects also shipped on 2026-09-20 and are already fixed on `main`**, both INP on the
home page, both live under an hour: `8ced566` awaited an entire PDF out of IndexedDB before
navigating on a recent-tile tap (fixed by `c188e4a` 40 minutes later), and `604bd31` fired
`navigator.storage.persist()` on every IndexedDB open including plain reads (fixed by `a729106`
48 minutes later). Nothing is owed on either; they are recorded because they are in the window
and they are the most likely contributor to a real dip in the Sep 20 numbers.

## Why CI never said anything

Every CLS assertion in the suite covers a tool page reconstructing saved work
(`e2e/tool-layout.spec.js`, and the Sign/Redact/Merge restore acceptance specs). **Nothing
measured the page most visitors land on**, and nothing measured the returning visitor whose
recents arrive after hydration, which is the only path on `/` that shifts at all. Both
occurrences of this class - QUAL-10 on 2026-09-13/14 and this one - were therefore found on a
dashboard days later rather than in a pull request.

## Delivered

Shlomi's call on 2026-09-21: hold the CSS until Speed Insights is segmented by route, device and
CLS specifically, rather than change the home page on a delta this size. So this ships the
measurement and the missing guard, not a fix.

- `e2e/home/landing-cls.spec.js`, in `PERF_BUDGETS` so it runs at `--workers=1`. It asserts
  per-source, the way `tool-layout.spec.js` does, and pins current behaviour rather than the fix:
  no element *other than* the dock may move outside `#home-files` (named explicitly, so a new
  passenger fails however little it weighs), total landing CLS stays under 0.03, and a first
  visit with no recents stays at exactly 0. It deliberately does not assert the dock stays put;
  that line tightens when the decision below is taken.
- Two methodology notes are baked into the spec because both cost a rewrite to find: its CPU and
  network throttling is load-bearing (unthrottled, the spec passes on a build that is shifting),
  and an earlier revision that read 1.5s after the tiles appeared raced the paint, closing its
  window at 2.80s on an entry timestamped 2.82s.
- `.claude/rules/home-page.md`: the residual bullet carries the re-measured figures from both
  surfaces, the dock's participation and its cause, and the guard's actual scope.

## Open, and needing a decision rather than a patch

The guard above pins the blast radius at today's behaviour. It does not make the dock stop
moving, because every way to do that is a trade the rule has already weighed once:

Shlomi is holding this pending the dashboard read. If CLS on `/` for mobile is flat there and
INP is what moved, the two already-fixed Sep 20 defects are the better explanation and this CSS
is a side issue; the guard still earns its place either way. The three options, unchanged:

1. **Reserve the rows before first paint**, the way QUAL-10 fixed the tool pages: a blocking
   head script reads the recents count and sets an attribute on `<html>`, so the grid reserves
   only for a visitor who actually has recents. This answers the rule's stated objection to
   reserving ("for every visitor, to smooth a transition only returning visitors see"), but
   CLAUDE.md says never to add an `is:inline` script, and the one on `ToolPageLayout.astro`
   carries a hand-computed CSP hash that breaks silently if its text changes by a byte.
2. **Let the launcher scroll inside its cell** at <=1023px, the pattern `b6410be` already uses
   for short desktop windows. Cheap, and it holds the dock still, but it puts a nested scroller
   on the first screen of a phone, which the "one composed unit" invariant is wary of.
3. **Accept 0.0144.** It is inside the band the rule already accepts, five times under the 0.1
   that starts "needs improvement", and it buys a landscape phone that is not visibly broken.

## The larger lever this exposed, not in scope here

On a 4x-throttled phone profile the home page paints at ~0.62s and does not finish hydrating
until ~5.3s, which is when the shift lands. The 261KB brotli of eager JS on `/` is what sits in
that gap, and it is the one number that would move CLS, INP and LCP together. Worth its own
ticket rather than being folded into this one.
