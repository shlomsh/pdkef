---
id: "RED-66"
title: "One done state wherever Download is clicked: pinned strip, tidy bottom row, feedback kept"
status: "done"
priority: "P1"
epic: "redact"
depends_on: []
---

# RED-66 · One done state wherever Download is clicked

Filed 2026-10-22 from Shlomi's walk through pdkef.com/redact/, with screenshots of the toolbar Download
and of the bottom of the page after a save.

## Why

- `/redact/` brings about 81-85% of the site's clicks (`docs/seo-competitive-findings.md`), so its done state is
  where most visitors meet Compress and Sign.
- The toolbar Download and the bottom Download run the same `handleDownloadPdf`
  (`PdfRedactTool.tsx:981`); only the bottom one sits next to the done state. The toolbar is the obvious place
  to finish, and from there the result, the "Compress it · Sign it" chips and the rating ask are all below the
  pages, off screen. The only feedback is a grey "Saved ..." line in the header, and Shlomi's downloads list
  shows the same file saved twice.
- The bottom of the page, read top to bottom after a save, mixes states and repeats itself:
  1. "Saves with 1 box" (the before-download caption) stays above "Saved <name> · 1 page".
  2. The saved-file check lists every deleted word and every earlier Find query, with no dedupe
     (`findTerms: [...deletedTerms(elements), ...findTerms]`, `PdfRedactTool.tsx:811`): "Hello rating" twice, then
     stray "1", "2", "3".
  3. On a page saved as a picture, every row says "No match in the text I could read", then the next line says
     "Page 1 is a picture, so look it over yourself". The rows say nothing true there.
  4. The rating ask is last, under the whole check.

## Decision (flow agreed with Shlomi 2026-10-22)

The done state has three phases, always in this order, and **feedback is one of them, not an afterthought**:
**result → next tool → feedback**.

1. **Either Download opens the same done state where the person is looking.**
   - The toolbar Download confirms in place for a moment ("Saved", check icon), still the plain toolbar button
     (QUAL-27: export is never filled in the toolbar).
   - A strip opens pinned directly under the toolbar: the file name, page count and size; the one line about
     pictures ("Saved as pictures, so nothing hides under a box." or the mixed / text forms from `finishState.ts`);
     then Compress it and Sign it as equal halves. The Compress chip carries the size, since pictures make the file
     heavy. A ✕ closes it; the next edit closes it. It never covers the page and never moves it.
   - It is not a second component: the strip and the bottom row render the same done-state pieces.
2. **Feedback stays in the flow, in both places.** The SEO-46 rating ask keeps its trigger (a download or a share),
   its 1.5s delay and its 14-day device cadence, and joins the strip as its own row under the hand-offs. Today a
   toolbar download asks for feedback off screen, so this also makes the ask visible to most people for the first
   time. The 4-5 star follow-up (Share, Star it on GitHub) and the 3-or-less follow-up show in the same row. The
   rating row never pushes the hand-offs down out of sight on a phone: hand-offs first, rating under them.
3. **The bottom row is one thing per row** (it stays as the end-of-document summary for people who scroll):
   - result line (no before-download caption once saved),
   - Download again · Share,
   - Compress it · Sign it,
   - the saved-file check, collapsed to one line,
   - the rating ask, as today.
4. **The saved-file check says only what it knows.**
   - Terms are deduped by label (case and space folded), and only words the person deleted are checked
     automatically. Old Find queries are not. Typed searches stay as they are.
   - On picture pages there are no per-word rows: one line, "Page N is a picture. Have a look at it before you
     share.", with "Search the saved file" collapsed behind it.
   - A finding that survived (a word still in the text, a detail that survived) still opens the check expanded,
     as today. Only the all-clear collapses.

Phone: the strip is one full-width row under the toolbar, chips as equal halves, ✕ in its corner, rating row
under the chips.

## Measuring it

No new event. Compare, two weeks before and after: Redact `tool_result_ready` against Compress and Sign
`tool_file_accepted` with `source: 'handoff', from: 'redact'`, and `tool_rating` count from `/redact/`.

## Done when

- Toolbar Download and bottom Download both leave the result, the two hand-offs and (when the cadence allows) the
  rating ask visible without scrolling, desktop and phone. Playwright: click the toolbar Download at 1440x900 and
  390x844, assert the strip, both chips and the rating row are in the viewport.
- After a save the bottom row has no "Saves with ..." caption.
- The saved-file check: unit tests for dedupe (a deleted word also searched with Find appears once), Find history
  not checked, picture pages produce one line and no rows, and a surviving finding still expands. Each seen failing
  first.
- Copy in the repo voice, no em dashes, Hebrew wording to match.
- SEO-46 is in progress on the same rating component: the rating row reuses `RatingPrompt`, and any change to its
  trigger or cadence is agreed in SEO-46 first.

## Built (2026-10-22, landed in 07212fb1..cfc3db82)

- The strip hangs from the sticky toolbar card as an overlay: it never moves the page, and it covers the
  top of what scrolls under the card until the next edit or the ✕, like the card itself. Putting it in
  the card's flow would push the page down on every save.
- The bottom pair keeps the plain "Download" label. "Download again" next to Share wraps to two lines
  on a phone, past the compact pair's 52px (`editor-finish-compact.spec.js`), and the result line above
  it already says the file is saved.
- Redact has no Hebrew edition, so there is no Hebrew wording to match yet.
- One `RatingPrompt` moves between the strip and the bottom row; it keeps its phase across that remount
  for the page's life, so the ask is never shown twice or lost mid-question. Trigger and cadence are
  unchanged.
