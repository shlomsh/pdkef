# Show the verb: a tool page's first screen

**Status:** chosen 2026-10-14, not built yet. Lane `tool-pages`, tickets
[HERO-01](../backlog/tasks/HERO-01.md) to [HERO-05](../backlog/tasks/HERO-05.md).
**Sketch:** [`docs/tool-hero-sketch/index.html`](./tool-hero-sketch/index.html), the source of the
private artifact Shlomi reviewed (https://claude.ai/artifact/FMqEhG9ujBDNoFPE3VjsqN). It is rough on
purpose and differs from this record where a decision below says so.

## Abstract

On desktop, a tool page's first screen is one composed hero, sized to the screen. The tool's name and
what it does sit on the left. On the right is a sheet where the tool acts out its own job once, in
about two seconds, with paper pages: Merge's two stacks slide into one, photos drop in and become
pages, a padlock opens, a page turns and another lifts out. That sheet is where files go, and a file
dropped anywhere on the page lands there. Once a file is in, the same screen becomes the workspace:
the headline shrinks to one line and the pages fill the space the hero held. How it works, the FAQ
and the guides sit below, unchanged, in the static HTML. On a phone the layout stays stacked.

## Why

The 2026-10-14 review measured the four shared-template pages on pdkef.com (Merge, Image to PDF,
Unlock, Edit PDF) at 1440 and 390 wide, after Shlomi said the template was good but not crisp:

- ten different left edges in the first screen at 1440 (icon tile, h1, card, dashed box and the How it
  works card each start somewhere else);
- a card inside a card: a white bordered, shadowed card (22px radius) around a paper-filled dashed box
  (16px radius);
- four colour families in one widget: paper fill, teal dashed border, olive privacy text (a lime pill
  on phones), on a mint band;
- the band's gradient stops are pixel values tuned to Merge's height, so on the other three pages it is
  cut mid-fade into a one-pixel seam;
- the h1 is pinned at 32px while the 32 to 52px hero scale goes unused, and the SEO title reads as the
  headline ("Image to PDF Online Free: Combine JPG & PNG" is five lines on a phone);
- three alignments at once (h1 start, Merge's note end, airplane line centred) and a desktop button
  about 600px from the text it belongs to;
- the filled On-device chip has the same teal as Choose files, so the first filled thing on screen is a
  badge; the offline glyph is a smudge at chip size;
- nothing tells the tools apart: the same tile gradient and the same file-plus icon on all four.

Three directions were pitched and sketched: Press proof (a bare sheet with printer's crop marks that
lock on when a file is dragged over), Show the verb, and Night desk (a dark work surface with one
bright sheet). Show the verb won. Its moment lands on phones, where there is no drag, and on every
visit. It makes ten tools look like ten tools, and it shows the work happening on the device instead
of adding another privacy sentence. Shlomi then asked for the full-height desktop hero, to focus the
first screen and push the rest down.

## History this replaces

MERGE-06's first pass (2026-09-13) made Merge's desktop empty state a drop box that filled the first
screen; the same day it became a fixed 260px band, and the UX guideline's heading 12 said "Never a
viewport-filling dashed box." The `fillViewport` prop on `BasePdfTool` is what is left of that pass;
no tool passes it. What read as a void was an empty box filling the height. Here the height is filled
by the headline and the verb, so heading 12 changes in the same change as this record, and HERO-02
deletes `fillViewport` and its CSS.

## The first screen on desktop (1024px and up)

- **Height.** `clamp(600px, 100svh - app bar, 900px)`, content centred vertically. A small laptop gets a
  full first screen and a big monitor stops at 900px, so How it works peeks in below.
- **Two columns, 5fr and 7fr.** Left: the tool tile, the h1, the three-sentence subhead (the subhead
  rule is unchanged). Right: the sheet with the verb, under it the drop heading and its body line
  (today's `emptyMessage` / band copy, and the privacy line), then Choose files.
- **Choose files sits in the sheet, not under the subhead as in the sketch.** The hero is static
  `.astro` and the button belongs to the tool island. Putting it in the left column needs the
  island's control split across that boundary: a static `<label for>` aimed at the island's input, or
  a subgrid through `main`, `#app` and `astro-island`. Both are fragile for little gain, and the sheet
  is where files go anyway. Revisit only if the built page shows the left column reading as
  unfinished.
- **A footer row** at the bottom of the first screen: the airplane line at the start, an in-page link
  to How it works at the end. The link is a plain anchor (add an id to the section if it has none), so
  the SEO surface ships no JS.
- **Merge's no-limit note** ("Combine as many files as you like...") moves word for word to just above
  How it works.
- **The basics.** Everything in a column hangs on that column's start edge, two edges in all. The
  sheet is the only framed object: no card around it, one radius, no dashed border. The mint field
  fades back to the page colour at its bottom, with no pixel-tuned stops and no seam. The chips are one
  quiet outlined row: On-device is no longer filled, and Works offline gets the plane icon from the
  airplane line. Colours come from `global.css` tokens only.
- **The sheet's colour** is `--color-surface`, not `--color-paper`. `styling.md` reserves paper for
  dropzones and header chips; HERO-02 updates that line in the same change.
- **The h1 is split, not rewritten.** Two spans, the tool name ("Merge PDF") and the rest ("Online
  Free: Combine Files in Your Browser"), joined by one space, so the h1's text content is exactly
  today's. The split point is a per-tool, per-locale data field next to `h1`; a unit test checks that
  the two parts join back to the h1 for every tool and locale. Title, description and JSON-LD do not
  change.

The phone layout (under 1024px) keeps today's order (hero, then the card, then the airplane line) and
today's phone first-viewport behaviour; it picks up the basics and the verb only.

## After a drop: the same screen is the workspace

- The hero condenses through the mechanism that exists today (`data-hero-condensable`, the per-tool
  `condenseOnLoad` flag in `src/data/tools.js`) to one line: tile and h1. The subhead stays in the DOM.
- The tool card keeps the first-screen height as its `min-height`, so nothing below jumps up and the
  page does not shrink under the pointer.
- Every loaded state is otherwise unchanged; guideline headings 1 to 3 still govern it.

## Drop anywhere

- The island listens on `window` for `dragenter`, `dragover`, `dragleave` and `drop`, and acts only when
  `dataTransfer.types` includes `Files`, so Merge's page reordering and text drags pass through.
- A depth counter flips state only on the enter and leave edges, never per `dragover` event, in the
  spirit of the gesture golden rule. The counter is a pure function with its own unit test.
- The island sets `data-dragging` on its own root. Static CSS on `.tool-stage:has([data-dragging])`
  tints the first screen and lifts the verb; no island code touches the static DOM.
- A drop routes to the handlers that exist (`DropzoneEmptyState`'s `onDrop`, `BasePdfTool`'s
  `onWorkspaceDrop`), so accept filters and the replace confirmation behave as they do now.
- The page-grid tools get it first (HERO-04). Sign and Redact get it with HERO-05, since a drop over an
  open editor needs its own answer.

## The verb

| Tool | What it acts out | Sketched |
| --- | --- | --- |
| Merge | two stacks slide together into one | yes |
| Image to PDF | three photos drop in, straighten, and each becomes a page | yes |
| Unlock or Protect | the shackle lifts and the hatching over the page clears | yes |
| Edit Pages | a page lifts and turns 90 degrees, another lifts out, the row closes | yes |
| Split | one stack parts into two along a perforation | pitch only |
| Compress | a page settles smaller and lighter (no invented numbers) | pitch only |
| PDF to Image | a page lifts and becomes a photo print | pitch only |
| Compress Image | a photo settles smaller | pitch only |
| Sign | a hand-drawn stroke writes across a signature line | HERO-05 |
| Redact | a black bar sweeps across a line of text | HERO-05 |

- **One motion style.** Plays once per page load, about two seconds, and ends on a still frame that
  explains the tool on its own. Paper pages with one shadow, the existing `--ease-emphasized` curve, no
  loops. Dragging a file over lifts the verb; it never replays.
- **It never makes anyone wait.** Choose files and the drop target work from the first frame; the
  verb is something to see, not a step (`content-and-copy.md` rules out animation that slows a
  workflow).
- **No words inside the verb.** The caption under it carries the copy. The sketch's small labels
  ("merged_report.pdf", "Unlocked") are dropped, which also keeps the verb free of strings to
  translate.
- **Reduced motion gets the last frame.** The base styles are the last frame; keyframes run only under
  `prefers-reduced-motion: no-preference`.
- **CSS only, server-rendered.** The verb is markup in the island's server-rendered empty state, so it
  plays from first paint, before hydration. The island's first client render must match it, so
  hydration never restarts or flashes it.
- **No `style` attributes in the markup.** The CSP's `styleDirective` is `'self'` (`astro.config.mjs`),
  which blocks inline style attributes in server-rendered HTML. The sketch's per-element custom
  properties become classes in the CSS module.
- **Each page ships one verb.** The shared paper pieces (page, photo, lock, floor shadow) live in
  `src/shell/verb/`. Each tool's verb, markup and keyframes, lives in `src/tools/<tool>/verb/` and
  reaches the shell as an `emptyArt` prop on `BasePdfTool`. Page-weight budgets and the CSS ratchets
  hold.
- **RTL.** The layout mirrors through logical properties. A verb that moves pages sideways mirrors in
  RTL, so pages flow right to left on the Hebrew edition.

## New copy

Only the drag-over caption is new: "Let go to add your files" (or "your file" for a one-file tool),
in English and Hebrew, for Shlomi to approve before HERO-04 ships. The How it works link reuses that
section's own heading. Everything else is today's copy, moved.

## Guards

- **One Playwright spec, chromium only.**
  - The first screen at 1280x680, 1440x820 and 1920x1040: the h1, the sheet and Choose files are fully
    visible, How it works starts below the fold at the first two sizes, there is no horizontal
    overflow, and layout shift stays at 0 while the verb plays.
  - A file dropped on the hero's text column loads in the tool.
  - Under reduced motion the verb shows its last frame with no running animation.
- **Unchanged and green.** The phone layout specs, and `e2e/tool-layout.spec.js`: the app bar stays
  `body > div > div`.
- **Unit tests.** The h1 split joins back to the h1 for every tool and locale; the drag-depth counter;
  every page-grid tool passes an `emptyArt`.
- **Before handover.** A scripted path matrix on a production build (`npm run build && npm run
  preview`): the eight page-grid tools, three desktop sizes plus the phone, empty, dragging and loaded,
  with the console checked for CSP violations.

## Build plan

Team-lead mode, as CLAUDE.md describes: the contract first, disjoint files per implementer, each piece
integrated and checked by the lead as it lands, and a fresh zero-context reviewer at the end.

**The contract, written before any brief:**
- The layout: `ToolPageLayout`'s `.tool-stage` becomes a desktop grid with three areas: `hero`, `card`
  and `foot`. It is two columns while the island's root carries `data-empty` and one column once a
  file is loaded. `--first-screen` is defined once on `.tool-stage`.
- The island: `BasePdfTool` gains `emptyArt?: ComponentChild` and sets `data-empty` and `data-dragging`
  on its root. `DropzoneEmptyState` renders `emptyArt` in the sheet, in place of the file-plus icon and
  Merge's ghost band.
- A verb: a Preact component with no props and no state, markup only, built from the shell's paper
  pieces, with its CSS module beside it. Its base styles are the last frame.

**Waves:**
1. Three pieces in parallel, each with its own files.
   - The layout and the basics: `ToolPageLayout.astro`, `ToolHero.astro`, `AppBar.astro`,
     `TrustChips.astro`, the h1 split fields in `src/data/tools.js` and `src/i18n/localizedTools.ts`.
     This is HERO-02.
   - The paper pieces and Merge's verb as the reference: `src/shell/verb/`, `src/tools/merge/verb/`.
     This is HERO-03.
   - The drop-anywhere hook and its pure counter: a new `src/shell/useWindowFileDrop.ts` and its test.
     This is HERO-04.
2. One writer wires `BasePdfTool` and `DropzoneEmptyState` to `emptyArt`, `data-empty` and the hook.
   Meanwhile the Image to PDF, Unlock and Edit Pages verbs are built in parallel, each in its own tool
   folder.
3. The other four page-grid verbs: written pitches and one rough sketch round, Shlomi picks, then a
   parallel build.
4. The guards, the guideline and rule updates, the production path matrix, and the fresh review.
5. HERO-05, Sign and Redact, on the same frame.

## Open questions

- The drag-over caption's English and Hebrew wording (Shlomi).
- Whether the built left column reads as finished without the button (decision above).
