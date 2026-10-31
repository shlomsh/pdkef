# Show the verb: a tool page's first screen

**Status:** chosen 2026-10-14. The layout, the sheet, four verbs, drop anywhere and the first-screen guard are built (2026-10-15); the other four verbs and the drag-over caption are not. Lane `tool-pages`, tickets
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

**As built (2026-10-15).**
- The empty state is one sheet (`src/shell/DropzoneEmptyState.tsx`, `src/shell/Dropzone.module.css`): the
  tool's verb in an art slot, the heading, a quiet line with an inline check mark, then Choose files.
  The checking-draft placeholder wears the same sheet, so nothing resizes when the check settles.
- The sheet takes the first screen's height (`min(36rem, --first-screen - 9rem)`) only inside the
  page-grid two-column layout, on every tool. Compress and Compress Image had a shorter side-by-side
  sheet (`compact`) while their quality choices sat under it; the 2026-10-15 redesign moved those to
  after a file is picked, so they take the same sheet as the rest. Sign and Redact take the same grid
  when nothing is loaded (HERO-05).
- The two-column grid applies on `.tool-stage[data-layout='hero']:not(:has([data-tool-loaded],
  [data-tool-shell]))`, with `<main>` top-aligned, and is off
  under `html[data-draft-hint]` and `html[data-merge-restore]`, so a restoring page keeps the geometry it
  already reserves (`src/layouts/ToolPageLayout.astro`). `--first-screen` is defined once on
  `.tool-stage`. The footer row and the How it works link are placed on that grid.

The phone layout (under 1024px) keeps today's order (hero, then the card, then the airplane line) and
today's phone first-viewport behaviour; it picks up the basics and the verb only.

## After a drop: the same screen is the workspace

- On desktop the hero condenses to the icon and the tool's name (`src/components/ToolHero.astro`). It
  uses the same signals as the existing condense rules: `html:has([data-editor-toolbar])` (Sign and Redact) together
  with `[data-tool-shell]` or `[data-tool-loaded]`. The rest of the h1 and the subhead are hidden, not
  removed, so the h1's text content is unchanged.
- This reverses the 2026-09-12 decision to keep page-grid heroes full on desktop. The full hero now
  belongs to the empty first screen, where it is the point; once a file is in, the workspace gets the
  room.
- The loaded card keeps `calc(var(--first-screen) - 5.5rem)` as its `min-height`
  (`src/shell/PdfTool.module.css`), 5.5rem being the condensed hero, so nothing below jumps up and the
  page does not shrink under the pointer.
- Every loaded state is otherwise unchanged; guideline headings 1 to 3 still govern it.

## Drop anywhere

- `useWindowFileDrop({ enabled, onDrop })` (`src/shell/useWindowFileDrop.ts`) listens on `window` for
  `dragenter`, `dragover`, `dragleave` and `drop`, and acts only when the drag carries `Files`, so
  Merge's page reordering and text drags pass through. A drop an element already took is left alone.
- A depth counter (`src/shell/fileDragDepth.ts`, pure, with its own unit test) flips state only on the
  enter and leave edges, never per `dragover`, in the spirit of the gesture golden rule.
- `BasePdfTool` calls the hook with `receiveDrop` and sets `data-dragging` on its card. Static CSS on
  `.tool-stage[data-layout='hero']:has([data-dragging])` tints the stage with an inset primary ring and
  lifts the verb; no island code touches the static DOM.
- The opt-out is the `dropAnywhere` prop on `BasePdfTool` (default true). Sign and Redact now leave it on (HERO-05): a drop
  over an open editor goes through the replace confirmation.
- A drop routes to the handlers that exist, so accept filters and the replace confirmation behave as
  they do now.
- Not built yet: the drag-over caption ("Let go to add your files"). It waits for approval of the copy.

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
| Sign | a field types a name, then a signature writes along its line | HERO-05, built |
| Redact | a frosted box blurs two lines, then a footer watermark is whited out | HERO-05, built |

- **Built (2026-10-15):** Merge, Image to PDF, Unlock or Protect and Edit Pages, each in
  `src/tools/<tool>/verb/` with a unit test. The shared pieces are in `src/shell/verb/` (`VerbStage` and
  `paper.module.css`: the box, the floor shadow, the page and photo). Unlock's lock and hatch live in
  its own folder, because only it uses them.
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

- **Built: `e2e/tool-hero-first-screen.spec.js`, chromium only.** It asserts:
  - On each of the eight page-grid routes at 1440x820 (Merge and Image to PDF also at 1280x680 and
    1920x1040): the h1, the sheet and Choose files sit fully inside the viewport, `#how-it-works` starts
    at or below the fold (at the first two sizes), there is no horizontal overflow, and layout shift
    stays under 0.001 over 2.5 seconds while the verb plays.
  - A file dropped on the hero's subhead, after a `dragenter` that sets `data-dragging`, loads in the
    tool, and `data-dragging` is gone afterwards.
  - Under reduced motion, Merge's and Unlock's verbs are visible with no running animation in the sheet.
  - A drag over the h1 on Image to PDF puts an inset ring on `.tool-stage`, and a `dragleave` takes it
    off.
- **`e2e/tool-layout.spec.js`** keeps its box and icon-row checks for Sign and Redact, and checks the
  stacked eight on their own terms: the icon ends before the h1 begins and shares its start edge, and
  the title row still lines up with the brand. `merge-layout.spec.js` follows the new hero.
- **Unchanged and green.** The phone layout specs.
- **Unit tests.** Built: the h1 split joins back to the h1 for every tool and locale; the drag-depth
  counter and the hook; each built verb renders. Still to add, once all eight verbs exist: every
  page-grid tool passes an `emptyArt`.
- **Before handover.** A scripted path matrix on a production build (`npm run build && npm run
  preview`): the eight page-grid tools, three desktop sizes plus the phone, empty, dragging and loaded,
  with the console checked for CSP violations.

## Build plan

Team-lead mode, as CLAUDE.md describes: the contract first, disjoint files per implementer, each piece
integrated and checked by the lead as it lands, and a fresh zero-context reviewer at the end.

**The contract, written before any brief:**
- The layout: `ToolPageLayout`'s `.tool-stage` becomes a desktop grid, with the existing children (hero,
  `main`, airplane line, How it works link) placed by grid row and column, not by named areas. It is
  two columns while `.tool-stage[data-layout='hero']` contains `[data-empty-state]` and the page is not
  restoring (`data-draft-hint`, `data-merge-restore`), and the usual single column once a file is
  loaded. `--first-screen` is defined once on `.tool-stage`.
- The island: `BasePdfTool` gains `emptyArt?: ComponentChild` and sets `data-dragging` on its card
  while a file is over the window. There is no `data-empty` marker: the sheet's own `data-empty-state`
  is the signal. `DropzoneEmptyState` renders `emptyArt` in the sheet, in place of the file-plus icon
  and Merge's ghost band.
- A verb: a Preact component with no props and no state, markup only, built from the shell's paper
  pieces, with its CSS module beside it. Its base styles are the last frame.

**Waves** (1 and 2 are done; 3 is in progress):
1. Done. Three pieces in parallel, each with its own files.
   - The layout and the basics: `ToolPageLayout.astro`, `ToolHero.astro`, `AppBar.astro`,
     `TrustChips.astro`, the h1 split fields in `src/data/tools.js` and `src/i18n/localizedTools.ts`.
     This is HERO-02.
   - The paper pieces and Merge's verb as the reference: `src/shell/verb/`, `src/tools/merge/verb/`.
     This is HERO-03.
   - The drop-anywhere hook and its pure counter: a new `src/shell/useWindowFileDrop.ts` and its test.
     This is HERO-04.
2. Done. One writer wired `BasePdfTool` and `DropzoneEmptyState` to `emptyArt` and the hook, and the
   Merge, Image to PDF, Unlock and Edit Pages verbs were built, each in its own tool folder.
3. The other four page-grid verbs (Split, Compress, PDF to Image, Compress Image): written pitches and
   one rough sketch round, in progress. Shlomi picks, then a parallel build.
4. The first-screen guard is built. Still to do: the guideline and rule updates, the production path
   matrix, and the fresh review.
5. HERO-05, Sign and Redact, on the same frame.

## Decisions made during the build (2026-10-15)

- Sign and Redact share the new empty-state sheet (white, content height) ahead of HERO-05, rather
  than keeping the old dashed paper strip. (Superseded: HERO-05 gave them the page-grid first screen.)
- The On-device chip is outlined on every page except home (`src/components/AppBar.astro`), content
  pages included, not only tool pages.
- The compress verbs show what compression really does: the same document at a lower resolution, text
  and image a little less sharp, never pages merging into one (Shlomi, 2026-10-15). The sketch is
  `docs/tool-hero-sketch/compress-verbs.html`.
- Split deals pages from one deck onto a second, then the two decks part (sketch:
  `docs/tool-hero-sketch/more-verbs.html`).
- Unlock condenses after load like the other page-grid tools; its old opt-out had no reason left.
- The grid gate is `:not(:has([data-tool-loaded], [data-tool-shell]))` with `<main>` top-aligned, not
  `:has([data-empty-state])`: the old gate let a slow parse paint the stage as a column first.
- The throttled layout-shift guard (`e2e/tool-hero-throttled-cls.spec.js`) runs alone, as a perf budget.
- The app bar's chips are not painted until the row is complete (`src/components/TrustChips.astro`).
- A hand-off writes a synchronous `pdkef:handoff-pending:<tool>` sessionStorage marker
  (`src/lib/handoff/handoffPending.ts`, read by `src/lib/handoff/useHandoffIntake.ts`). The pre-paint script in
  `src/layouts/ToolPageLayout.astro` turns it into `html[data-handoff-pending]`, so the page opens in
  its loaded layout: grid off, hero condensed, column hidden until the file is in. A stale marker (a
  hand-off whose navigation never finished) releases at once and moves the condensed hero to its
  centred place, one shift of about 0.05 at 1440x820. Accepted (the guard allows < 0.06): hiding the
  hero too would contradict "condensed from first paint".
- A known narrow case: a Merge restore whose saved entry has gone (the index says known, IndexedDB says
  gone) shifts the hero about 0.04 at 1024px and up when the marker clears. Accepted as narrow; the same
  class existed below 1024px before.
- Hover replay (`61b0c252`): the verb plays once on load and stops on its last frame. It replays when a
  mouse or pen enters the sheet, and when the tab becomes visible again; never on touch (a tap opens the
  picker). Shlomi chose this over a continuous loop: a loop competes with the h1 and the Choose files
  button for attention, and a page that never stops moving reads as an ad. The replay never snaps to the
  start pose: every animation plays backward at 2x (`updatePlaybackRate(-2)`) and then forward as on load
  (`src/shell/verb/replay.ts`). 3x was tried first and measured a 44px step in one frame as the pieces
  reached their start, which read as a snap; 2x measures 30px against 15.7px for the forward play.
  `e2e/tool-hero-verb-replay.spec.js` bounds the largest frame-to-frame step at 2.2x the forward play's.
  Reduced motion has no keyframes, so nothing replays.
- Drag caption (`5709421e`): while a file is dragged over the page (`data-dragging`), the sheet's heading
  is swapped by CSS alone for "Let go to add your files" ("Let go to add your file" on one-file tools).
  Hebrew is Shlomi's wording, "גררו לכאן כדי להוסיף קבצים", used for both forms until he picks a
  singular. Both strings are `display: none` when not shown, so a screen reader reads one.
- Compress and Compress Image verb, "Loupe" (2026-10-15): Shlomi rejected a press that turned many pages
  into one ("not true") and asked that the verb show resolution loss, the image and text losing
  sharpness. Two options were sketched in `docs/tool-hero-sketch/compress-verbs.html` (R1 Soften: the
  piece shrinks to 92%, its photo turns blocky in three steps and its text lines blur; R2 Loupe: the
  same plus a magnifying glass over the photo showing the big square pixels at 2.5x). He picked R2. One
  component, `src/tools/compress/verb/CompressVerb.tsx`, serves both pages: a page on Compress, a photo
  print on Compress Image (`analyticsTool === 'compress-image'`). The mosaics are SVG rects in
  crispEdges, one `<g>` per tone so no rect carries a class, built once at module load from a pure
  function (`src/tools/compress/verb/mosaic.ts`, horizontal runs merged), because the CSP forbids the
  sketch's inline colours.
- Compact sheets cap the verb at 24rem (`Dropzone.module.css`, `[data-compact]`): at the default 42rem
  the verb was 344px tall and pushed Compress's quality cards below the fold at 1440x820; at 24rem the
  sheet ends at 496px and the cards sit on the first screen. Superseded 2026-10-15: Compress's quality
  choices moved to after a file is picked, so Compress and Compress Image take the full sheet and the
  `compact` cap is gone.
- The hero hides until it is fully parsed (`ToolHero.astro`, a `tool-hero-end` marker, the TrustChips
  pattern): the hero is centred in the first screen, so a paint of a partly parsed hero (icon only,
  74px) placed it 143px low and the rest pulled it up, CLS 0.015 on /compress/ one load in three. The
  Loupe's CSS lengthened the inline stylesheet, which moved the parser's paint point into the hero; the
  marker removes the class of bug rather than that instance.

- Vertical balance (`7bfc6c02`, Shlomi: the sheets were top-heavy and Compress was cramped). Every
  page-grid sheet centres its content (24px above against up to 64px below before), held hidden until
  fully parsed by an end marker so a partial paint cannot move it. Compress and Compress Image put the
  picture beside the words, centre the words against it, and centre their column against the hero. The
  quality cards' pros and cons open together behind one toggle, and the greyed-out button waits for a
  file. Superseded for Compress on 2026-10-15: no cards and no button before a file is picked, and the
  picture sits above the words as on every other tool.
- Merge's phone tile stays beside the name (`55b13f13`). The stacked hero put the tile above the h1 and
  cost the phone first screen 29px (51px on Linux fonts, where the second h1 line wraps). The sticky
  Download sheet can only rise to the top of its own container, so it ended 14px below a 659px viewport
  and the WebKit job on main failed (run 38712678326). Back beside the name it measures 621.9px. The
  hero-icon guard (`d1f0c7b5`) checks the tile lines up with the first line there, within 4px.
- Compress Image's hand-off marker (`1f81c39a`): the launcher saved the hand-off under the compress key,
  so the pre-paint script never saw the marker. The marker is now written and cleared under every page
  a hand-off key opens. If the island never loads, a CSS-only reveal after 6s brings the page back, and
  an unmounted intake releases the marker.
- DEBT-52 (`8dc1b5bb`, `822f03c8`): Compress's note slot is as tall as its tallest note, so no analysis
  outcome shifts the options. When no note shows, the slot is empty space: an accepted gap. Superseded
  2026-10-15: the note moved into the file strip, which always reserves two lines.
- Hebrew drag caption (`ade5f01c`): Shlomi's singular, "גררו לכאן כדי להוסיף קובץ", on every one-file
  tool; Merge and Image to PDF keep the plural. He kept the loaded card at its full-screen height
  (2026-10-15).
- HERO-05, the editors (`7f24c0bd`, `bf617824`, `825d6e7d`, `16e1a61b`):
  - Sign's verb: a field types a name, then a signature writes along its line. The name is CSS
    generated content, so the indexed page gains no text; Hebrew gets its own name, right to left
    (נועה לוי).
  - Redact's verb leads with blur, because "blur pdf" is that page's search intent and h1: a frosted box
    sweeps two lines, then a footer watermark is whited out.
  - At 1024px and up, with nothing loaded and no draft restoring, the editors use the page-grid first
    screen. Phone Sign and Redact are unchanged to the pixel (rects of tile, h1, subhead, note, main and
    stage at 390, 768 and 1023, before and after). Loaded and restoring editors look as before.
  - Drop anywhere is on. A drop over an open editor goes through the replace confirmation. A file whose
    type is known and not accepted skips the question and the tool says it cannot open it; a file with
    no type always asks, since a real PDF from some sources has none.
  - The hand-off marker covers the editors, so a file from Merge's Sign button or the home launcher does
    not paint the empty first screen and then collapse it.
  - Rejecting a stale restore marker moves the hero 0.041, accepted like Merge's 0.04 and recorded in
    the spec.

## Open questions


None open.
