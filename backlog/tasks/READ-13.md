---
id: "READ-13"
title: "Highlight PDF: the open mark wears a pencil outline, the other marks step back"
status: "open"
priority: "P2"
epic: "highlight-pdf"
horizon: "now"
order: 13
depends_on: []
---

# READ-13 · A pencil outline for the open mark

*Opened 2026-11-02.* Shlomi: the solid square border around the open note's mark "is crude and doesn't fit
the cool vibes" of the reader. Sketches of every option looked at, with today's box to compare:
https://claude.ai/artifact/TGjFAxSxw9SRDpjusNDiPo ("Rough outline" with "Fade other marks" on and
"Pencil note card" off is the chosen design).

## Outcome

The open mark (its note opened, picked by touch, or focused from the keyboard) is outlined by a double
pencil line, drawn the way Excalidraw draws, that follows the passage line by line. While a note is open the
other marks step back a little. The note cards stay exactly as they are. Marking still feels like holding a
highlighter: the outline is the only new ink, and it sits around the text, never on it.

## Decided

- **One indicator for three states.** Today `HighlightPage.module.css:4-8` gives `:focus-visible`,
  `[data-comment-focus]` and `[data-picked]` a 2px square `--color-text` outline around the mark's whole box
  (so a three-line passage gets one big rectangle), and a dashed one on card hover. All of them become the
  pencil outline: full for open, picked and keyboard focus, one faint single pass for hover. R40's focus ring
  is the outline itself (`--color-text` on the page is far above 3:1).
- **The outline follows the lines.** A staircase around the mark's bands, padded about 3px sideways (more
  runs into the neighbouring word) and 4px above and below, with near-equal line ends snapped together.
  Clean, sketched (READ-11) and underline marks all get it. It follows the band geometry on turned pages
  (`data-page-turns`).
- **The same every time.** rough.js `polygon` with `roughness` about 1.15, `bowing` about 1.1, stroke width
  about 1.2px in `--color-text`, seeded from `strokeSeed(id)` (`src/editor/geometry/sketchStroke.ts`), so a
  mark draws the same outline whenever it opens. It draws on once, about 450ms; reduced motion shows it
  whole.
- **The others step back.** While a note is open or a mark is picked, every other mark's fill sits at about
  55% opacity. A hovered or focused mark comes back to full. Note markers (pins, dots) never fade, and R40 in
  READ-01 gains one sentence allowing the fade while a note is open, the way it allows the dozing capsule.
  The existing deepening of the open mark (`HighlightNode.module.css:13-16`) stays.
- **Cards unchanged.** `src/editor-ui/comments/CommentRail.module.css` is not touched.
- **Looked at and dropped:** a glow in the mark's own color, a margin bracket, a pencil loop, hatching the
  open mark's fill, and a pencil border on the open card. Hatching comes back as a style of its own in
  [READ-14](READ-14.md).

## Steps

1. **Bring in rough.js 4.6.6** (MIT) with its four helpers (`hachure-fill`, `path-data-parser`,
   `points-on-curve`, `points-on-path`): add them to `src/data/runtimeLicensePolicy.js`, run
   `npm run generate:licenses`, add the `optimizeDeps.include` entry `astro.config.mjs` asks for, and load it
   with `import()` on the first open so it stays out of first-load JS. Add a highlight-pdf row to
   `scripts/check-lazy-modules.js` so it cannot slip into the page's first paint, and check
   `test:precache-budget`.
2. **A pure outline function** beside `sketchStroke.ts`: bands in, staircase vertices out, then rough.js's
   generator (not its DOM renderer) turns them into path data with the mark's seed. Unit tests first: one
   band, a three-line RTL passage, near-equal line ends, the same id giving the same path.
3. **Draw it** in the mark's box as an SVG that overflows the box, and delete the outline rules in
   `HighlightPage.module.css`. Hover on a card draws the faint pass.
4. **The fade**: one state attribute on the page while a mark is open, CSS dims the other marks' fills.

## Acceptance

- [ ] Opening a note, picking a mark on touch and Tab focus all show the pencil outline, and no mark has a CSS
      outline any more (e2e reads the computed style).
- [ ] A multi-line passage gets one outline whose box encloses all its bands (e2e, desktop and phone width).
- [ ] The same mark draws the same path every time it opens (unit).
- [ ] While a note is open the other marks' fills sit at about 55%, a hovered or focused one is at full
      strength, and note markers do not fade.
- [ ] rough.js is not in the page's first-load JS (`test:weight`, `test:lazy-modules`), and
      `test:licenses` passes with the new packages listed.
- [ ] Reduced motion draws no animation.
- [ ] Seen on a real phone: picking a mark shows the outline and the bottom sheet as before.
