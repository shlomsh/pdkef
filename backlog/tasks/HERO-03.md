---
id: "HERO-03"
title: "Each page-grid tool acts out its job in the empty state"
status: "in_progress"
priority: "P1"
epic: "tool-pages"
horizon: "now"
order: 2
depends_on: ["HERO-02"]
---

# HERO-03 · Each page-grid tool acts out its job in the empty state

*Filed 2026-10-14.* The verb half of [docs/tool-hero-show-the-verb.md](../../docs/tool-hero-show-the-verb.md).

## Outcome

- Shared paper pieces (page, photo, lock, floor shadow) in `src/shell/verb/`.
- One verb per page-grid tool in `src/tools/<tool>/verb/`, passed to `BasePdfTool` as `emptyArt` and
  rendered in the sheet in place of the file-plus icon and Merge's ghost band. Merge, Image to PDF,
  Unlock or Protect and Edit Pages follow the sketch. Split, Compress, PDF to Image and Compress Image
  get written pitches and one rough sketch round first, and Shlomi picks.
- One motion style: plays once per load, about two seconds, ends on a still frame that explains the
  tool, no words inside, no loop. Choose files and the drop target work from the first frame.
- CSS only, in the server-rendered empty state, so it plays before hydration and hydration never
  restarts it. No `style` attributes in the markup (the CSP's `styleDirective` is `'self'`).
- Reduced motion shows the last frame. In RTL a verb that moves pages sideways mirrors.

## Guards

- Unit: every page-grid tool passes an `emptyArt`.
- Playwright (chromium): layout shift stays at 0 while the verb plays; under reduced motion the verb
  shows its last frame with no running animation.
- `test:weight` and the CSS ratchets do not rise: each page ships only its own verb.

## Progress

*2026-10-15.* Landed on the branch:

- `a1da04b1` the empty state is one sheet with an art slot (`DropzoneEmptyState.tsx`,
  `Dropzone.module.css`); `BasePdfTool` takes `emptyArt`. The checking-draft placeholder wears the same
  sheet.
- `baf5d34a` the shared paper pieces in `src/shell/verb/` and the Merge, Image to PDF, Unlock or Protect
  and Edit Pages verbs in `src/tools/<tool>/verb/`, each with a unit test. Unlock's lock and hatch live
  in its own folder, since only it uses them.
- `2eb5b3e4` the sheet's quiet line is a text block with an inline check mark.
- `e2e/tool-hero-first-screen.spec.js` (from `909f6299`) covers layout shift while the verb plays and
  the reduced-motion last frame, for Merge and Unlock.

Left: the Split verb, and the final checks (`test:weight` and the CSS ratchets on a production build). PDF to Image is already done.

*2026-10-15.* Hover replay landed in `61b0c252`: the verb replays on mouse or pen enter and on tab return, easing back along its path at 2x first. See "Decisions made during the build" in `docs/tool-hero-show-the-verb.md`.

*2026-10-15.* The Compress and Compress Image Loupe verb landed in this branch (`src/tools/compress/verb/`). See "Decisions made during the build" in `docs/tool-hero-show-the-verb.md`.
