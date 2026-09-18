---
id: "DEBT-16"
title: "Flaky CLS assertion in tool-layout.spec.js's stale-restore test"
status: "done"
priority: "P2"
epic: "architecture-debt"
phase: "near-term"
depends_on: []
---

# DEBT-16 · The stale-restore inverse-CLS budget is too tight for what it measures

*Filed 2026-09-19*, from two red `main` runs nine minutes apart on 2026-09-18.

## Problem

`e2e/tool-layout.spec.js:141`, "does not create inverse CLS when a validated restore marker is later
rejected", failed on `main` CI twice on 2026-09-18, chromium, 2 CPU-worker shard runners:

- Run [35396098920](https://github.com/shlomsh/pdkef/actions/runs/35396098920), commit `f06ec7d5`
  (`BACKLOG.md` and `backlog/tasks/QUAL-13.md` only), 21:18 UTC.
- Run [35396848060](https://github.com/shlomsh/pdkef/actions/runs/35396848060) attempt 1, commit
  `03f32f35` (ARCH-23: moved e2e specs and CI config, touched no page), 21:27 UTC.

Both failures: `Expected: <= 0.001`, `Received: 0.0014093303246099109`, confirmed from the raw job
logs (jobs 105765206840 and 105767583508). The received value is bit-for-bit identical in both runs,
which points at a deterministic shift on the runner's font rasteriser rather than random scheduling
noise; that is an observation, not a conclusion, since only two occurrences are in evidence.

A third run in between, [35396335942](https://github.com/shlomsh/pdkef/actions/runs/35396335942)
(commit `be07106c`, also backlog-only), is not a same-test pass: its `e2e` jobs (and `build`/`checks`)
were all skipped, so the test never executed there. Scanning the other ~55 runs in the last 24 hours
of `main` history where this test's shard did execute (job logs checked directly, not just the run
conclusion), it passed every other time, including on both chromium shards of runs right before and
after the two failures (e.g. `35377684466` at 18:02, `35266328031`/`35259440316`/`35257367955`/
`35256706208` on 2026-09-17). The other `main` failures in that window (`81162a01`'s toolbar-wrap
assertion, `4325853b`'s webkit run, `d59daac7`/`5bbc2b84`'s merge-layout assertion, etc.) are unrelated
tests; `tool-layout.spec.js:141` passed in every shard where it ran alongside them. So: **2 failures
in the observed window, both within nine minutes of each other, both an identical received value, and
no other occurrence found.**

## What the test measures vs. what it should protect

The test (added in `392a6547`, "fix: stabilize restored PDF editor layouts") sets `data-view-density`,
`data-draft-hint` and `data-editor-restore` on `<html>`, lets two frames settle, starts a
`layout-shift` `PerformanceObserver`, then removes `data-editor-restore` and `data-draft-hint` (the
"restore rejected" transition) and asserts the accumulated CLS is `<= 0.001`. Its own comment already
concedes "hero typography itself necessarily changes by a few pixels" and budgets 0.001 as headroom
for "sub-pixel glyph-box remeasurement" - but the actual CSS toggled by these attributes
(`src/components/ToolHero.astro`, the `@media (min-width: 1024px)` block) is not sub-pixel: dropping
`data-editor-restore` (with `data-view-density='condensed'` still set) removes
`--hero-title: 1.75rem`, `--hero-icon: 2.5rem` and `padding-bottom: 0.75rem` overrides on
`.tool-hero[data-hero-condensable]`, and un-hides `[data-hero-sub]` (`display: none` is removed, so the
subhead paragraph reappears). That is a real resize of the hero's own title, icon and subhead, not
noise - and it is legitimate: the test's stated purpose (per its comment at line 135-140) is to guard
that *already-visible downstream content* does not get pulled up the page while the tool body and
follow-ups are still hidden, not that the hero itself is pixel-static during its own compact-to-expanded
correction. The `PerformanceObserver`, however, scores every layout-shift entry on the page, so the
hero's own legitimate resize is mixed into the same accumulator as the "inverse CLS" the test is meant
to catch.

## Candidate fixes

1. **Scope the measurement to downstream content only.** Only observe/sum layout-shift entries for
   elements below the hero (or subtract the hero's own shift, e.g. by diffing
   `document.querySelector('.tool-hero').getBoundingClientRect()` before/after and excluding shift
   sources whose bounding client rect is inside it). This makes the assertion guard exactly what the
   surrounding comment says it guards - stationary already-visible content - instead of an incidental
   font/type resize inside the hero itself. This looks feasible from the test alone: the hero's
   condensable elements (`h1`, `.tool-hero-icon`, `[data-hero-sub]`) are already read by
   `measureHero()` a few lines above, so the same selectors can identify what to exclude, and
   `PerformanceObserver`'s `layout-shift` entries expose `sources[].node` for exactly this filtering.
   Recommended: it keeps the assertion meaningful rather than just wider.
2. **Raise the budget to what the runner actually produces, plus margin** (e.g. 0.003-0.005). Simpler,
   one-line change. `0.0014` is still two orders of magnitude below the 0.1 "good" Core Web Vitals CLS
   threshold, so a wider budget does not stop protecting real users. Trade-off: it stops asserting
   near-zero shift and would not catch a regression that pushes real inverse CLS up to, say, 0.01-0.05,
   which the current 0.001 budget would catch today (when it isn't itself the false-positive source).

Recommend option 1 if the exclusion is straightforward to implement and keep readable; fall back to
option 2 only if isolating the hero's own shift turns out to be fragile across the three call sites
(`measureHero`'s fields: `height`, `titleSize`, `iconSize`, `paddingBottom`, `subheadDisplay`).

## Why it matters now

`tool-layout.spec.js` sits in the product e2e shard (`e2e (1)`/`e2e (2)`, 2-way chromium matrix,
`playwright.config.js`) that runs on nearly every push, since `e2e/` top-level specs widen with any
`CORE_PROJECTS` change (`site`, `shell`, `editor`, `lib` - see `.claude/rules/tests.md`). A false red
here costs a rerun and, worse, can mask a genuine failure landing in the same push.

## Acceptance

- The assertion at `e2e/tool-layout.spec.js:173` reflects one of the two candidates above, with the
  reasoning for the choice left in a comment (matching the file's existing commenting style).
- The test still fails if downstream content is genuinely pulled up the page during a rejected
  restore (do not weaken it into a no-op).
- No other occurrence of this failure on `main` in the next ~2 weeks of pushes, or, if it recurs, the
  fix is revisited with the new data point.

## Outcome (2026-09-19)

Fixed on `main` with the per-source option. The observer now classifies every `layout-shift`
source by whether it sits inside `.tool-hero`; anything outside the hero must contribute exactly 0,
and the hero's own remeasurement gets a 0.01 allowance. Measured: the only shifting node is the
citron accent `<span>` QUAL-13 added to the `<h1>` (619px wide to 706px at the 1.75rem to 2rem
font-size step), 0.0009 locally and 0.0014 on the ubuntu runner; the tool card resizes during the
same transition but is unpainted, so it contributes no CLS, which is the invariant the test is for.
`--repeat-each=10` green locally; the CI run on this commit is the runner proof.
