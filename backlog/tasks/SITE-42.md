---
id: "SITE-42"
title: "Home: picked files wake the toolbar, which becomes the tool chooser"
status: "open"
priority: "P2"
epic: "polish"
horizon: "now"
depends_on: []
needs: "Decide D1-D4 below before T6 starts"
---

# SITE-42 · Home: picked files wake the toolbar, which becomes the tool chooser

*Seen 2026-10-12: a new visitor (no recents) came to merge two files and clicked the home dropzone
first, expecting to choose the tool afterwards. A first attempt the same day was rolled back
unlanded; this file is the plan for the second one.*

## Why

The home page's only call to action promises one thing and does another. The tile reads "Choose
files / or drop PDFs here", but the picker takes one file (`src/site-lib/FileDropzone.tsx:219`, no
`multiple`), that file always goes to Sign (`toolTarget="sign"`), two dropped files end in a
plain-text error naming Merge (`FileDropzone.tsx:84`), and an image ends in "Please choose a PDF
file." "File first, tool second" is a sound model, so the dropzone stays the call to action and
keeps its promise. It also teaches: a first-time visitor should learn that the toolbar at the
bottom of the first screen is where all ten tools live, so **the toolbar itself is the chooser**,
not a new list inside the tile.

## Design (decided)

One rule: the tools that can take everything picked light up in the toolbar; when only one can,
it opens straight away.

| Picked | What happens |
| --- | --- |
| one PDF | tile shows the name, "Now pick a tool below" and "Change"; the eight PDF tools take a citron ring, the two image tools dim; a click on a lit tool opens it with the file |
| two or more PDFs | straight to Merge, the only tool that takes several (every other PDF tool sets `multiple={false}`); Merge lights on the way |
| one photo (JPEG, PNG) | Image to PDF and Compress Image light; on a phone the toolbar scrolls them into view |
| two or more photos | straight to Image to PDF, the only image tool that takes several |
| PDFs and photos together | see D3 |
| anything else | set aside with a note; the rest is routed as above |

- The starter tile ("PDkef practice form.pdf") keeps opening Sign directly.
- A dimmed tool stays a plain link to its page, without the file. Escape and "Change" return to
  rest. Focus moves to the first lit tool; an `aria-live` line says the prompt.
- Nothing is inserted into the first screen and nothing moves (`.claude/rules/home-page.md`): the
  tile changes its own contents, the toolbar's state is attributes on existing elements.
- The toolbar stays static links that work without JavaScript; the island only marks them while
  files wait.

## Decisions for Shlomi (before T6)

- **D1 · Copy.** Drafts, English and Hebrew: "or drop them here, then pick a tool below", "Now pick
  a tool below", "Change", "{count} files", "Opening {tool}...", "Left out: {names}", "PDFs and
  photos go to different tools. Choose one kind at a time.", "Choose PDFs, or JPEG and PNG photos."
- **D2 · The closing launcher.** The home page has a second launcher near the bottom
  (`HomePageLayout.astro:488`, `final`), a full scroll away from the toolbar. Recommended: a pick
  there that needs a choice scrolls back to the first screen (as its own "back" link to
  `#home-tour` already does) and wakes the toolbar there.
- **D3 · A mixed pick.** Recommended: say PDFs and photos go to different tools, open nothing.
- **D4 · The arrow.** Recommended: the hand-drawn looped arrow in the demo's annotation ink, drawn
  on like a pen stroke, from the tile's start side down to the toolbar's start, where the first
  lit tool sits.

## What the first attempt taught (2026-10-12)

- **QA on `astro dev` is not QA.** Vite's mid-session dependency optimizer reloaded Merge two
  seconds after it took the one-shot hand-off (files gone), and later 504'd stale chunks
  ("Outdated Optimize Dep"), leaving Merge blank. Shlomi only ever gets a `build` + `preview`.
- **The tile must constrain the name.** A long underscore name spilled out of both sides of the
  tile and under the arrow; a Hebrew name reordered its "(2)". Fix: text column
  `minmax(0, max-content)`, name in `<bdi>` with an ellipsis, "Change" never shrinks, a start
  gutter for the arrow while files wait.
- **Do not lift lit tiles.** The dock has 10px of block padding; a 5px lift plus a 3px ring hit its
  top edge, and the edge fades (sticky strips, `align-self: stretch`, so content box only,
  `HomePageLayout.astro:879-929`) left the raised parts uncovered at both ends. Ring only, and the
  strips get `margin-block: -10px`. Those strips behave differently minified (see the comment
  there), so they are checked on the build.
- **Merge needs its own fresh-set path.** `reset()` (`PdfMergeTool.tsx:730`) deletes the saved set
  (`clearDraftRef`, :752), and the saved-set restore can resolve after the hand-off, so the
  hand-off must win whichever lands first, without deleting the old set from recents.
- **Phone QA over LAN http has no `crypto.subtle`**, so Merge does not save its set there. Expected.
- **Unexplained:** on the attempt's build, scrolling the home page down showed the header pushed
  down under a blank band. Not diagnosed; T0.

## Contracts (written first, by the lead)

- `src/site-lib/routeFiles.ts`, pure: `routeFiles(files) -> { kind: 'open', tool, files, skipped }
  | { kind: 'choose', tools, files, skipped } | { kind: 'none', reason: 'mixed' | 'unsupported',
  skipped }`, and `handoffKeyFor(slug)` (Compress Image is the Compress island in image mode,
  `src/pages/compress-image.astro`, so it collects under `compress`).
- Hand-off record (`src/lib/drafts/draftStore.js:201`): today one file; add `{ files: [{ fileName,
  fileType, fileBytes }], from? }` beside it. `takeHandoff` returns either; `useHandoffIntake`
  keeps its single-file signature (a multi record gives it the first file); new
  `useHandoffFilesIntake(tool, onFiles)`.
- Dock attributes: each dock link carries `data-tool="<slug>"` (static); while files wait the island
  sets `data-picking` on `.home-hero` and `data-fits` on the links that can take them.

## Tasks

Each task: named files, a red test first, `npm run check:fast -- --since <task start>`, no stash,
stage by name. The lead reads every diff and integrates each piece as it lands.

| # | Task | Files | Who | After |
| --- | --- | --- | --- | --- |
| T0 | Reproduce the scrolled-down layout on an `origin/main` build at the sizes Shlomi used. Pre-existing: its own ticket. Not: note it here as a T9 check. | none | lead | |
| T1 | `routeFiles` + `handoffKeyFor`, table tests for every row above | `src/site-lib/routeFiles.ts`, `.test.ts` | implementer | |
| T2 | Multi-file hand-off record, `useHandoffFilesIntake`, round-trip tests | `draftStore.js`, `useHandoffIntake.ts`, their tests | implementer | |
| T3 | Merge takes a hand-off as a fresh set in pick order; a late restore cannot overwrite it; the saved set stays in recents | `PdfMergeTool.tsx`, its test | implementer | T2 |
| T4 | Image to PDF (several), PDF to Image and Edit PDF Pages (one) take a hand-off through their own pick path | the three islands, their tests | implementer | T2 |
| T5 | Dock: `data-tool` on links; waking styles (citron ring, no lift, dimmed 0.35); edge strips over the block padding | `HomePageLayout.astro` | implementer | |
| T6 | Launcher island: `multiple`, accept PDFs and JPEG/PNG; route through T1; waiting state; dock wiring (click on a lit tool, focus, scroll the first lit tool into view, Escape, `pageshow` restore); sample opens Sign; D2 for the closing launcher; strings en + he (D1) | `FileDropzone.tsx`, `.test.tsx`, `toolMessages.ts` | implementer | T1, T2, T5, D1-D3 |
| T7 | Tile visuals: the arrow (D4) and its draw-on, name truncation and `<bdi>`, arrow gutter | `FileDropzone.tsx`, `.module.css` | lead | T6 |
| T8 | Guards (rendered geometry only, the rest is unit): phone toolbar brings the lit image tools into view; a long and a Hebrew name stay inside the tile and clear of the arrow; Back from a tool shows the home page at rest (extend `e2e/home/back-navigation.spec.js`, real bfcache) | `e2e/home/` | implementer | T6, T7 |
| T9 | Path matrix on `build` + `preview`, phone and desktop: one PDF to each of the eight tools, one photo to each image tool, two PDFs, two photos, mixed, Escape, Change, dimmed link, both launchers, scrolled-down layout (T0), edge fades at both ends, no console errors | scratchpad script | lead | T3-T8 |
| T10 | Review by a fresh subagent with no shared context, every objection quoting its line | | reviewer | T9 |
| T11 | Shlomi tries the build preview on his iPhone, then land | | Shlomi, lead | T10 |

T1, T2 and T5 run in parallel; then T3, T4 and T6 in parallel. Nothing is shown to Shlomi before
T9 is green.

## Acceptance

T9's matrix is green on the production build at 375px and 1280px, T8's guards are green in CI,
`check:push` passes, and Shlomi has tried T11 on his phone. Out of scope: Merge's own output-name
overflow on long names (its own task, started 2026-10-12).
