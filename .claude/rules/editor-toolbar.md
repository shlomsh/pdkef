---
paths:
  - "src/editor-ui/SignToolbar.module.css"
  - "src/editor-ui/ToolbarMenu*"
  - "src/editor-ui/FullscreenButton*"
  - "src/editor-ui/EditorExportActions*"
  - "src/editor-ui/EditorToolStatus*"
  - "src/editor-ui/UndoRedoButtons*"
  - "src/editor-ui/ArmHint*"
  - "src/tools/sign/components/SignToolbar*"
  - "src/tools/sign/components/IconToolButton*"
  - "src/tools/sign/components/MoreToolsMenu*"
  - "src/tools/sign/components/toolButtonProps*"
  - "src/tools/redact/components/RedactToolbar*"
  - "src/tools/redact/components/BrushToolMenu*"
  - "e2e/tool-toolbars/**"
  - "src/tools/sign/e2e/*toolbar*"
  - "src/tools/redact/e2e/*toolbar*"
  - "src/tools/highlight/e2e/tool-row-phone.spec.js"
---

# Sign/Redact main toolbar layout

Loaded when working on the main toolbar row that Sign and Redact share (`SignToolbar.module.css`), the
controls in it, or the specs that guard it. Every figure here was measured and each rule names its
guard. The rest of the editor (arming, selection, gestures, undo, the element toolbar): `editor.md`.

## Main toolbar layout (`SignToolbar.module.css`, shared with Redact and `FullscreenButton`)

- Every control is a 44x44 CSS px touch target (`--btn-min-size`; WCAG 2.5.5 AAA and Apple HIG).
  Below 920px the row has one explicit `flex-basis` of `--btn-min-size` per control and, once it
  has to wrap, `flex-grow: 0` with each wrapped line centred. Guard:
  `e2e/tool-toolbars/toolbar-touch-targets.spec.js` (jsdom has no layout; it drives both `/sign` and
  `/redact`, so it lives under `e2e/`, not either tool's own `e2e/` folder).
- Size from `.toolbar > *`, never `.toolbar .dropdown`: the row mixes `<button>`s and
  `<div class="dropdown">` wrappers, and a `.dropdown` rule outranks the child selector (dropdowns once
  rendered ~13px beside ~31px buttons under `flex-basis: 0`).
- `flex-grow: 0` once it wraps, or lines of five and four get different widths and nothing is left to
  centre. `--controls-per-row` (half the count, rounded up, via `:has(> :nth-child(N))`) caps each line
  so nine controls wrap 5+4 not 8+1; it engages inside `@container` queries whose pixel thresholds
  are the one hand-computed thing in the file and must be redone if `--btn-min-size`, `--toolbar-gap`
  or `--toolbar-padding` change, or if a control is added anywhere. Round a new threshold **up** past
  its figure unless you have checked the box cannot land in the band below it: the content box is the
  viewport less 46.8px on a phone, 62.8px from there to 767px and 112.8px from 768px (below 768px the
  loaded Sign/Redact card has no frame since 2026-10-28, 50px wider than the dated measurements below
  were taken at, so their viewports below 768px now read 50px narrower), so an ordinary integer window width
  puts it on x.2, and both thresholds that were left on the floor() side of a whole-number figure
  (581px, 288px) were measured stranding or unbalancing a real row at one - 693px gave 11+1, 384px
  gave 5+5+2. Flex, not grid: grid packs a
  partial last row into the leading columns. **Only some counts can be balanced at the 44px floor**,
  because greedy flex fills each line to the cap: ten lands 4+4+2 or 3+3+3+1 and thirteen lands
  6+6+1 or 4+4+4+1, while nine, eleven and twelve all land evenly. That is what decides when an
  optional control stands down, not taste. The counted set is
  `:nth-child(N of :not(.desktop-download):not([role="radiogroup"]))`: Sign counts **twelve** with Share
  and **eleven** without (SIGN-49: Highlight, Comment and the three shapes live in the More menu, and
  Feedback is not a Sign control, so nothing on Sign carries `data-optional-control` and nothing stands
  down), Redact **nine** (ten once a redacted export exists and "Compress" appears). Twelve, eleven and
  nine balance, so no stand-down is needed. Measured 2026-11-12: Sign with Share is one line from a
  648px window, wraps 6+6 below it (4+4+4 from 288px, 3+3+3+3 from 239px) and 6+5 without Share; every
  control is >= 44px from 360px. The eleven-control rule fires at 532px, not 531px: the box is
  fractional (531.2px at a 594px window) and 531 stranded 10+1. Redact holds one line to 544px, wraps
  5+4 to 348px and 3+3+3 from 347px. Redact's tenth control (the "Compress" hand-off, which only exists
  once a redacted export does) puts it on the one count that cannot balance: one line to 608px, 5+5 to
  336px, then 4+4+2 from 335px down. That is the shape the file tolerates for ten - a full short row,
  never a lone control - and no cap improves it (three gives 3+3+3+1). The 13-of to 15-of rules and the
  337px/387px queries in `SignToolbar.module.css` served the thirteen-to-fifteen Sign of SIGN-44/46 and
  are inert now; keep them as the ladder for a toolbar that grows. Guard:
  `src/tools/sign/e2e/sign-toolbar-labels-fit.spec.js`, every width 919px to 239px with Share, no lone
  control.
  Highlight's row is one line at every width: Marker, Undo, Redo, Feedback, Replace, Print, Share where
  the browser has it, Download. Feedback (Highlight's own control, unlike Sign) stands down at 480px and below, where eight tiles cannot hold
  the 44px floor. Guard: `src/tools/highlight/e2e/tool-row-phone.spec.js`.
- **On a phone (480px and down) both toolbars show a word under every control**, Undo and Redo
  included (and Feedback on Redact and Highlight), from one shared block at the end of `SignToolbar.module.css`, sized by RED-61's
  formula below; a two-word label wraps between words. Sign's guard is
  `sign-toolbar-labels-fit.spec.js` (360-430px and `/he/sign/`). Redact keeps its own 480px block,
  because its tripled `.bar` rule would otherwise outrank the shared size.
- Redact's eleven counted controls stay two rows on a phone (the card-height guard, `toolbar-phone-row.spec.js`), so at 390px a control is 44.9px wide; Redact's phone label size is `min(0.66rem, (control width - 8px) / 5.2)` (RedactToolbar.module.css, RED-61, Shlomi's call 2026-10-08), 7.1px at 390px, guarded by `redact-toolbar-labels-fit.spec.js` at 360 to 430px. A four-per-row step was tried and broke the card guard, and its `:nth-child(11 of ...)` selector also caught Sign's eleven or twelve.
- **Redact keeps the file's details unless the person changes them (RED-59).** The engine's `applyDetailEdits` (`src/tools/redact/lib/documentTraces.js`) takes per-id edits (`title`, `author`, `made`, `attachment:<page>:<name>`, `scripts`, `hidden`...), always drops `/Thumb`, XMP thumbnails and `/PieceInfo` (each can show what a mark covers), and on the flattened path never copies a value that reaches a page (`reachesPage`); the footer line and Review sheet live in `src/tools/redact/components/details/`. Copy that says a download "leaves out" details is wrong; `docs/redact-content-removal.md` has the per-id table.
- Two anchors, desktop and iPhone, one step between (SIGN-29, 2026-09-18). Highlight: from
  1300px the row is one line with labels, set 4px apart; the toolbar box plateaus at 1172px of content
  (a 1280px window), so a classic scrollbar at 1300px no longer eats into it. Below 1300px every
  control is icon-only on one line, until the row's 44px targets stop fitting, and from there down the
  phone grid above. Measured 2026-09-20 in headless Chromium on Linux (the wide DejaVu face CI lands
  on), the old twelve-control Sign row was 1139.7px against the 1172px box; keep the gap at 4px while a
  margin is that thin. No label may ever truncate: `flex-shrink: 0`, and if the labelled row ever
  outgrows the box it wraps whole, which `e2e/tool-toolbars/toolbar-desktop-one-line.spec.js` catches.
  **Sign's labels follow the toolbar's own width instead**: one container tier,
  `@container toolbar (min-width: 1160px)` inside `@media (min-width: 920px)` (the finish block in
  `SignToolbar.module.css`, scoped by `data-finish="strip"`). Measured on macOS Chromium 2026-11-12 the
  labelled row with Share needs 1136px of content and the box tops out at 1172px inside its padding,
  about 36px of headroom for Linux's wider system fonts. Undo and Redo stay `data-icon-only` at every
  width above the phone: an arrow is a convention, and neither is a tool. Earlier container-query label
  tiers (keyed on `data-label-priority`) were tried twice and drifted twice, because each carried
  hand-measured per-label thresholds; this one tier has one measured number with stated headroom, and
  `toolbar-desktop-one-line.spec.js` pins it at 1280 and 1100.
  **Redact takes the same finish and keeps its words (RED-73, `data-labels="stack"`)**: Blur, Blackout
  and Whiteout share one shape of icon, so the word is what tells them apart (RED-34). Beside the icon
  in the same 1160px tier, under it below (54px controls, 12px words); Undo and Redo are arrows above the
  phone, as in Sign. Measured on macOS Chromium 2026-11-12 the labelled row needs 1115px with Share
  (57px headroom) and all 1172px with the Drive arrow too, so with Drive connected Full screen gives up
  its word; stacked, Share and the arrow need 761px against 796px at a 920px window. Guard:
  `e2e/tool-toolbars/toolbar-finish-groups.spec.js` (dividers, words beside at 1280 and under at 1100).
- Sign's own toolbar order reads in the order a form gets done: the filling vocabulary first (Text,
  Date, Mark, Whiteout), then Sign as the last thing you do to a filled form (it is the tool the page
  is named for, but it led the row for one day under SIGN-29 and read as the wrong first step), then
  More (Highlight, Comment, the three shapes: the tools used less often; the button becomes the armed
  tool, word and icon, at the same width), then the history group beside the work it acts on (Undo, Redo
  - the same pair, in the same order, as Redact), then the chrome group (Full screen, Replace, both
  labelled), then export at the far edge (Share, Download). Groups are divided by a `::before` on the
  group's first control (`data-group-start`: More's root, Undo), never a toolbar child. Redact's
  groups: Blur, Blackout, Whiteout, Delete | Find, Peek (they look, they mark nothing) | Undo, Redo ...
  Full screen, Replace | Share, Download; its order is unchanged, led by Blur since f48fcbd8.
- **The row is quiet**: tools, Replace and Share are ghost controls (Sign, Redact; Highlight, a reading
  tool, keeps its framed tiles under `data-finish="tile"` and takes only the strip's soft hover and
  outlined Download, READ-28), and Download is the one outlined control, joined in one outline with the
  Drive arrow when Drive is connected. Its 1.5px frame is a 1px border plus a 0.5px inset ring, each
  half of the Download/arrow pair ringing only its outer sides: Chromium floors a border's width to whole
  CSS pixels (SIGN-51, READ-28; guard `e2e/tool-toolbars/toolbar-finish-groups.spec.js`). Teal fill on a toolbar button means one thing, an armed tool:
  Redact's open Find and held Peek take the tinted ground instead. Export is never filled in the toolbar (QUAL-27, Shlomi 2026-10-20): the completion row under
  the document is the call to action, and a restored draft once lit Share and Download up with nobody
  asking. Disabled Download/Share keep their quiet style with a muted label. Guard:
  `e2e/tool-toolbars/toolbar-export-quiet.spec.js`, Sign, `/he/sign/` and Redact, phone and desktop,
  after a draft restore. Replace's lime highlight lives only in the shell file banner, where it is the
  row's one control.
