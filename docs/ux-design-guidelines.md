# UX design guidelines for PDkef tools

The app-wide guideline for how a PDkef tool looks, behaves and gets reviewed. First written
2026-09-13 from the Merge rebuild (the `merge-tool` epic, MERGE-01 to MERGE-18), where these choices
were made and measured; every later tool review adds to it here rather than in its own notes. It is
kept so the next tool review (Edit PDF Pages is the obvious next one, then Compress, Image to PDF;
Split is sketched, see §15) starts from what we already settled instead of rediscovering it. The Merge-specific spec is
[merge-direction-a-spec.md](./archive/merge-direction-a-spec.md), the sketch is
[merge-direction-a-sketch.html](./archive/merge-direction-a-sketch.html), and the review that drove the
second pass is [merge-review-2026-09-13.md](./archive/merge-review-2026-09-13.md). Cross-tool hand-offs are
also a standing preference of the owner's; see the last section.

The goal these serve, in Shlomi's words: an experience good enough that people return and recommend
it. Merge is an authority fight in search, so the tool's job is retention, not ranking.

## 1. The output is the centre

The thing on screen is the document the person is about to download, as pages, in output order. The
inputs (files) are a rail beside it, never the main view. We considered three directions: A, the
merged document as a page grid with files as a rail; B, a file list first with pages under each; C,
per-file panels that keep pages inside their file. A won because B makes the inputs the subject and C
prevents moving pages across files. The test for any tool: can the person see exactly what they will
get before they get it, and change it there?

For a tool whose output is a single file (Merge, Edit Pages, Image to PDF, Compress with a visual
preview) this means a page grid. For Split, it means the output groups: one frame holding the
included pages in one mode, one frame per page in the other, with the left-out pages dimmed below
([split-stage-spec.md](./split-stage-spec.md)).

## 2. The simple case is the minimum

The most common use must be the shortest path: pick files, Download. No intermediate "Merge" step,
no "Apply" that only exists so a button can appear. The work happens once the person has gone quiet,
so Download is ready by the time they reach it.

Quiet means quiet, not a beat (owner, 2026-10-15, from Split: the button flipped to "Preparing 4
pages... 0%" on every rotate while the page was still being set up, a build nobody needed and a
flicker that pulled the eye):

- the wait is 1.5s after the last change, and every change inside a burst lengthens it (0.5s each, up
  to 4s), so a run of edits pushes the build back instead of starting one per edit;
- a change cancels the build in flight, and a superseded result is never shown;
- recent results are kept by their state (selection, rotations, mode), so an undo back to a state
  already built is instant and builds nothing;
- heading for the primary control (hover, focus, pointer down) starts the build at once, so a quick
  tap rarely waits;
- the build is silent: the primary control keeps its ready look and says nothing about preparing
  unless the person taps before it is done, and only then shows the ring below.

The shared policy is `src/lib/quietPrepare.ts`.

There is one primary element and it has states, rather than a button that appears:

- one file: a sentence ("Add one more PDF to merge") with a real nested action (Choose files), never a
  disabled button, never a grey box the size of the rail's largest element;
- waiting or building in the background: the ready look, with the counts it already knows ("4 pages")
  and the size joining when the build lands, in space already reserved for it;
- preparing after a tap: the same element, tinted, with a ring (the tap downloads on completion);
- ready: the filled button with honest numbers, "25 pages · 2.6 MB";
- saved: the same, with the check, and the next steps below it.

Honest numbers beat verbs. "Download merged PDF, 25 pages · 2.6 MB" tells the person what they will
get; "Merge now" tells them nothing.

Analytics follows intent: the operation counts when the person taps Download, not when the tool
pre-computes.

## 3. Disclose by state, not by disclosure

Options and next steps appear only once an output exists. Below two files there is nothing to
configure, so nothing is shown. A `<details>` around a single setting is ceremony: one checkbox is a
checkbox row. A setting that changes the output sits directly above the primary control, because that
is where the eye is when it matters.

"Exists" means ready, not "the person already tapped the primary control." Share and Compress are
gated on the output being prepared, the same instant the primary control's label changes from
preparing to ready; gating them on `saved` instead (Split's first build did) hides them behind an
action the person has not taken yet, which is the wrong order for something meant to sit next to
Download. A share button that already knows how to hide itself when nothing is ready needs no outer
gate on top of its own.

A default is shown as a choice among its alternatives, never as one card tinted among lookalikes. A
segmented control with both options side by side says "there is another way"; two cards where one is
preselected read as done, and people skip it (a real Split user did, and got the wrong output). When
the setting changes the shape of the output, the canvas changes shape with it, in place: the preview
is the setting. Never number a step that needs no action; "1. Select mode" over a preselected default
is exactly what gets skipped.

Explanations are one line, appear when they apply and disappear when they do not. "Pages moved across
files, so files no longer drag as a whole" shows only after a page has crossed a file, with Reset
order on the same line. Above the first thumbnail there is only the heading and the count. The
cognitive budget of the loaded state is: heading, one status line, the document, the rail.

## 4. Every row is one kind of thing

The rail order that came out of the review, top to bottom, each row a single kind:

1. the inputs (file list), with its own footer note when one applies;
2. a status line ("Draft saved", "Saving draft…"), alone, end-aligned, so its changing width never
   moves a control and the RTL edition mirrors it for free;
3. commands on the list (Add files, Clear all);
4. the setting that changes the output (Add page numbers);
5. the primary control (Download);
6. next steps (Share, Compress, Sign), each with its tool's icon.

Do not mix a setting into a row of commands: a switch among buttons reads as a button. Do not put a
"·" between buttons; that is link grammar. Reset order, Add files and Clear all are buttons and look
like buttons: bordered, no fill, one height (36px face, 44px hit area). Underline is for links that
navigate.

A quiet secondary link that only restates a control already visible one glance away is chrome, not a
second entry point. Split's primary control once carried "or save each page as its own PDF" under it
on the assumption the setting above might have scrolled out of view; once §15's stage actually kept
the setting and the primary control in the same block, the line just repeated the segmented control
sitting directly above it, and came out. Draw the adjacent-control check before adding a quiet link:
if the thing it offers is already on screen right next to it, the link is dead weight, not a second
chance to notice it.

## 5. Name the output, and let people rename it in place

The heading of the loaded state is the file name the person will get, "merged_<first file>", with
".pdf" shown muted and fixed. At rest it is a heading and nothing else: no box, no border, no pencil
in the text. Click or tap the name and it becomes editable where it is, same font, same size, caret
where the person clicked, zero layout shift. Enter or blur commits, Escape cancels, empty reverts
to the automatic name. Once edited, the name is theirs and stops following the
first file; Clear all resets it; the download attribute and the PDF Title follow it. The name has one
home: no "Saves as" line elsewhere.

The default pattern is decided (revised 2026-09-13): `merged_<first file base name>.pdf`, the same
shape as `signed_x.pdf` and `compressed_x.pdf`, chaining when the first file already carries a
prefix. No count, no connector, never a "+" in a file name. A prefix in the tool's language followed
by the name in its own direction needs no bidi isolation and no per-edition template.

A long name cuts in the middle and keeps the tail, the part that tells files apart ("…itc1040 (final)
(3)"). The extension is muted, and a real space precedes the count ("· 7 pages"). Editing shows the full
name. (MERGE-24, 2026-10-23)

## 6. Undo over confirm

Reversible actions get an Undo chip for five seconds ("Moved page 3 · Undo", "Removed X · Undo") and
never a dialog. Only destructive, non-recoverable actions confirm (Clear all, replacing a saved
draft). Every keyboard action announces through a live region.

## 7. Labels, not hints

Files are identified by a small tag (colour dot plus name) above the first page of their run, and by a
full caption row only for runs of four pages or more. The same colour dots mark the file rows in the
rail, so the two views agree without a legend. Icon buttons show their word under the icon on hover
and on focus; on touch the word is always there or the control is not an icon.

## 8. Touch is not hover with bigger targets

- 44px targets throughout. A 32px glyph may sit inside a 44px hit area.
- No hover-only affordance on touch. Per-item controls do not fit small cells (three 44px buttons
  cannot live on a 72px page cell; they overlapped the neighbours and hid each other). On the phone,
  tap an item to reveal that item's controls, or select it and act from one bar; either way the grid
  never reflows when a mode changes.
- No sticky bottom sheet (owner, 2026-10-20 for Sign and Redact as QUAL-27, extended to Merge in
  MERGE-24 on 2026-10-23). The bar sits at the top, sticky under the app bar, and carries a quiet
  Download (the plain button, never filled); the call to action is the completion row under the
  document, in the page flow: the setting, the filled primary control, then the next steps. The
  pinned sheet measured 259px of a 402px phone screen in Edit Pages (2026-10-21).
  Secondary commands live in a "…" popover anchored at the inline end, so the Hebrew edition flips it.
- A quiet toolbar Download uses the one-word label "Download"; "Download merged PDF" made it 197px wide
  in the sticky bar. The full label belongs to the filled primary control. (MERGE-24, 2026-10-23)
- On the phone, Share may matter more than Download: it is how a phone saves to Files, AirDrop and
  messages. It leads the next-steps row wherever the browser can share files.

## 9. Bidi is part of the design, not a fix

- A file name is laid out in its own direction (`unicode-bidi: plaintext`) with a middle ellipsis
  that keeps the number and the extension, so "טופס 1301.pdf" keeps its "1301.pdf".
- A name composed into a sentence or a template is isolated (`<bdi>` or FSI/PDI), or "+ 7" attaches
  to the Hebrew run and the line reads "signed_7 + … more.pdf". In code: `isolateName(name, t.dir)`
  (`src/lib/format.js`) for a name interpolated into a message, so English stays byte-identical.
- A name and its extension are one unit. Give the unit `<bdi>` (direction from the name's first
  strong character) and the ".pdf" `dir="ltr"` inside it; a bare ".pdf" beside an isolated name is
  its own run and laid out as "pdf." on the Hebrew page (the Merge heading read "pdf.merged_x", 2026-10-15).
  The name inside takes no `dir` of its own, since an element with a `dir` is skipped when `dir=auto`
  looks for the first strong character. Guard: `merge-rtl-file-name.spec.js` reads the rendered order.
- Alignment is `start` and `end`, never left and right, so `/he/` mirrors without overrides.
- Test with real Hebrew names in every pass; they surface truncation and layout bugs that Latin names
  hide.

## 10. Speed is part of the experience

Download being ready before the thumbnails is fine. Thumbnails at two per second is not: on twenty
trivial pages the document is a field of dashed placeholders for ten seconds, and after a restore on
a phone the first screen is blank. Target: twenty trivial pages under two seconds, the first visible
row before the heavy work starts, one open pdf.js document per file for the life of the view. Restore
must set scroll restoration ahead of the reload and scan the viewport itself, since an
IntersectionObserver never reports in a hidden document.

When sizing depends on data that arrives late (page aspect ratios), keep the element hidden until the
size settles (all inputs known, or a 400ms timeout), then show it once at its final size. Hidden
elements do not count toward CLS; a visible grid that resized 246, 324, then 270px scored 0.052. (MERGE-24, 2026-10-23)

## 11. Drafts are a quiet feature

Work survives a crash or a closed tab on the device. The tool says so in a status line ("Draft
saved"), never a banner, and on return says "Picked up where you left off · Start fresh" once, under
the heading, never twice and never as a modal. Clear all deletes the draft. The record carries every
input file and the arrangement (order, rotation, skips, the edited name) and is capped at 200 MB.

## 12. The empty state is the hero, never a void

On desktop the first screen is one composed hero, sized to the screen (`clamp(600px, 100svh - app bar,
900px)`). The tool's name and subhead sit on the left. On the right is a sheet where the tool acts out
its own job once (the verb), with the drop heading, the privacy line and Choose files under it, and a
file dropped anywhere on the page lands there. After a drop the same screen becomes the workspace.
What fills the height is the headline and the verb, never an empty box: MERGE-06's viewport-filling
dashed drop box read as a void and was replaced the same day. On a phone the empty state stays a
short stacked block under the hero. Design record:
[tool-hero-show-the-verb.md](./tool-hero-show-the-verb.md). All ten tools use this shape on
desktop (the two-column grid and the sheet from HERO-02 and HERO-03; Sign and Redact from HERO-05, with the
phone unchanged and a loaded or restoring editor as before).

## 13. Cross-tool hand-offs, and the reverse

The done state asks "what does this person do with the result next?" and offers the one or two
honest answers as quiet secondary verbs with the target tool's icon: Compress, Sign. Never in
front of Download, never a sales row, always in the voice. Look for the reverse too: an error or
empty state that points at the sibling tool that solves it (an encrypted file linking to Unlock, an
oversized draft to Compress). Candidates already visible: Split → Compress, Merge these; Unlock →
Sign; Image to PDF → Merge; Compress → Sign; Sign → Compress for portals with size caps.

A detour is the exception to "never in front of Download". When a tool sent the person here to clear
an obstacle (Redact sending a protected file to Unlock), their job is still in the first tool, so the
done state leads with the way back ("Continue in Redact") and keeps only a quiet download beside it:
no Share, no other next steps. The hand-off record names the sender (`from`), so the detour shows
only for a file that arrived that way; a file picked in the tool itself gets the ordinary done state.
And the done state replaces the control that produced it: once Unlock has run, its password form goes,
and Download stands where Unlock PDF was.

## 14. How we review

- Measure in a real browser, at 1280 and 375, with getBoundingClientRect and getComputedStyle; a
  claim in a report is not a result until it is measured. Inject files through the real input.
- Fixtures include one-page scans (the commonest merge), a long run with a landscape page, Hebrew
  names, and a file meant to fail (check that it really fails; a pdf-lib "encrypted" fixture did not).
- Findings are ranked P1 to P3, each with a reproduction, a fix and an acceptance line with numbers
  in it, so the builder can close it without interpretation.
- The Impeccable critique (dual agent, heuristic scoring) is a good first pass. Impeccable is a
  local tool now (installed per person at user level, not vendored in this repo; see
  `.gitignore`), and its snapshot lives under `.impeccable/critique/` on that machine. It scores;
  it does not decide direction. Direction comes from sketches the owner picks between.
- Verify the phone view on a real phone for anything the emulator cannot do (Web Share, scroll
  restoration, keyboard).
- Polish starts from a written target design: width by width, every line measurable, then a scripted
  path matrix on a production build before handover. Fixing screenshots one at a time without a target
  drifted, and the review said the work was getting lost. [merge-stage-spec.md](./merge-stage-spec.md)
  is the example. (MERGE-24, 2026-10-23)

## 15. The stage: canvas and commands stay together

The loaded state is one stage, the canvas and its commands, and a command that changes the output is
never out of view while the canvas is. On desktop the rail is sticky beside the canvas, below the
app bar, and scrolls inside itself when its file list outgrows the screen, with Download pinned at its
foot. Below 1024px there is no bottom sheet (§8): the bar above the canvas is sticky under the app
bar and holds the commands on the selection, a mode that changes the shape of the output (Split's),
and a quiet Download; the completion row under the canvas holds the setting, the filled primary
control and the next steps. A width where the mode scrolls away with the canvas is a bug, not a
breakpoint, which is the Split failure again. The test: at 1280, 820 and 375, scrolled to the
canvas's last row, a way to download and any mode that reshapes the output are fully inside the
viewport. Merge is the reference below 1024px (MERGE-24); Split and Edit Pages still pin a sheet and
move to this shape on their next pass.

Rules for the desktop rail and the stage, from the Merge polish pass (MERGE-24, 2026-10-23):

- Anything sticky clears the app bar: `top` is the app bar height (3.5rem, 56px) plus the gap, and a
  sticky panel is never taller than the viewport below it (`max-height: calc(100svh - 3.5rem - gaps)`).
  A rail taller than the window cut off its first and last rows.
- When a sticky panel's content outgrows it, only the list inside scrolls (at least two rows showing,
  overscroll contained) and the primary action stays on screen. This replaces the 2026-09-24 "page
  scroll, no nested scrollbar" rule for desktop rails, by the owner's choice.
- The scroll container is the list itself, never a wrapper that also holds tooltips or popovers: a
  tooltip bubble overflowing by 14px gave the rail a horizontal scrollbar. Nothing in a side panel
  scrolls sideways.
- Fill the stage. On desktop, size the content to the loaded card's first-screen floor, measured from
  the card's min-height and never its content height, instead of leaving it in a top strip. A
  page-grid card's floor is the viewport's foot at any window height and in either view density
  (`PdfTool.module.css`, guarded by `e2e/cross-tool/page-grid-parity.spec.js`). Below a
  floor size it wraps and scrolls as before. Draw thumbnails at stepped sizes of cell width times
  device pixel ratio (capped at 2) so bigger stays sharp. Phone and tablet keep their sizes.
- Below 1024px the card ends at its content: no minimum height on the grid, no slot reserved under
  every item for a state that is rarely shown, and main does not stretch to the screen's foot. Each of
  those left white under a short merge (100px and 77px measured at 650px). The heading's name,
  extension and count wrap as one run of text.

## 16. A display-only transform never hides more than the untransformed state did

Rotate is the clearest case, and it now exists in three tools (Merge, Edit Pages, Split), but the
principle is general: any control that changes how a page *previews* - rotate, a zoom, a fit toggle -
must never crop content the untransformed preview showed. A crop is a content decision the person
makes on purpose (Edit Pages' trim, Redact's mark); a rotate button is not one, and a person who taps
it has not asked to also lose part of the page.

Split's rotate shipped this exact bug and a real user hit it on the first try: a rotated ID scan's own
photo went missing, because the thumbnail's crop rule (`object-fit: cover`, tuned for the unrotated
aspect) was still active on the rotated, box-swapped preview, and cropped a thin sliver instead of the
whole page. The fix is `object-fit: contain` for the transformed state - letterboxed but complete beats
edge-to-edge and missing the one thing (a photo, a signature, a stamp) the person opened the tool to
check. Verify with a fixture that has something in the region a naive crop would take first, not a
fixture where any crop looks fine (blank pages and centred content hide this bug completely; the
regression here shipped past three centred-content unit tests and would have shipped past the whole
Playwright suite too).

A second, unrelated way the same feature breaks: a preview that resizes a box to compensate for the
rotation (so the rotated footprint still fills its cell) is fragile inside a flex or grid container -
the container's own default sizing (`flex-shrink: 1`, or a pre-existing `max-width: 100%` on the same
element) can silently override the compensating size before the rotation ever runs, on one axis but
not the other, which is easy to miss because it looks like a small cosmetic gap rather than a wrong
number. Measure the rotated box's own `getBoundingClientRect()` against its container's, not just a
screenshot - the crop bug above hides inside a rect that measures perfectly.

## 17. Editors on a phone: the page is the work, the bar is where you act

Added 2026-09-25 from the Sign next-generation review, revised 2026-09-26 after SNG-14 (the hop control
is the platform's, not ours). After 34 mobile tickets in 76 days, each fix was locally right and the
next edge sat right behind it. The full rules, with evidence, are in
[sign-next-gen-guidelines.md](./sign-next-gen-guidelines.md). These are the parts every editing tool
inherits:

- **Nothing floats over what the person is editing on touch.** A selected element's controls live in one
  fixed, contextual bar or sheet, never in a toolbar anchored to the element.
  - Every studied competitor that edits on a phone does this.
  - Ours broke under zoom, under the keyboard, and against the sticky strip.
- **The document takes the screen.** One row of chrome, margins kept to a minimum around the page, and
  no redundant line of copy.
- **The editor owns its zoom.**
  - Pinch and the zoom buttons change the app's zoom. Safari never zooms the editing surface: `touch-action` goes on the surface and on every descendant.
  - Fit always shows the whole page (§16).
  - Safari's own zoom cannot be set from code, and a sticky bar rides out of view under it.
- **Pinch is the zoom.** No layout switch, like jumping to a grid of pages, ever rides on a pinch by
  accident; that needs a deliberate extra step or its own control.
- **On touch, a swipe that starts on the page scrolls.** Only an element that was already selected
  moves. A second finger always cancels a one-finger gesture.
- **Move and resize are intentional.** Handles appear only after a direct tap on an element; arriving at
  it by a hop (the platform's own next/previous, Sign guidelines §3), or touching it with a pinch, never
  shows them.
- **Navigation that walks a document is the platform's own next and previous, never an arrow of ours.**
  iOS's ∧ ∨, desktop's Tab and Shift+Tab, Android's Next key: reading order belongs to the document, and
  none of them change meaning with the UI's language (Sign guidelines §3).
- **The app never claims what a form needs.** Even perfect detection cannot know which blanks are yours:
  an employer's section, an optional box. Detection may suggest where to go, never what must be filled:
  a wrong or missing suggestion costs one tap, and nothing is ever counted or flagged as missing.
  The person chooses what to write, and the app helps only with where, at the fingertip, declining when
  unsure. Every page is treated as an image, so a scan works like any PDF (owner, 2026-09-25; the Sign
  guidelines §1).
- **Every committed change is one undo step**, moves and typing included (UNDO-04). How undo announces
  itself on a phone is decided in the Sign guidelines §6.

## 18. The loaded state gives the screen to the tool

*(Compress, 2026-10-15)*

Decided for Compress, whose loaded state stacked short, low-value
bands (a large file card, a one-sentence note in its own tinted band, preset cards with badges that
repeated their names) and pushed the tool and its result below the fold. Compress shipped to
these rules in a64ea0ab, and they are the pattern every tool's loaded state follows. The shell strip
(rule 2) and the one-line hero (rule 1) apply to every tool since HERO-06; the rest is per tool (HERO-07).

1. **The hero shrinks to one line once a file is loaded:** the icon and the h1. The subhead stays in
   the HTML, hidden, so the SEO surface is unchanged (an opt-in on `ToolHero.astro`). It is also shrunk
   from first paint while a hand-off is arriving, so the page never jumps.
2. **The file is one compact strip, and it replaces the shell's file banner.** The tool sets
   `hideIdentity` and renders its own row: a 40px thumbnail, the name, the size as "843 KB → 212 KB"
   with a citron "N% smaller" tag, a note line that keeps two lines of space even when the note is
   shorter (so the strip does not change height as the note changes), and a quiet Replace button.
3. **The result is the centre** (§1). At 1024px and up there are two columns: the result in a `1fr`
   column, and a 360px rail holding the strip, the controls and the primary control. Below 1024px it
   is one column, in the order strip, controls, result, with the primary control pinned at the bottom
   of the card (§15).
4. **Work starts on pick and reruns on every option change** (§2): no run button where a sensible
   default exists, the same way Merge has no Merge button. Only the latest request runs, never two in
   parallel, and typing in a free-entry field (Compress's exact size) waits 500ms before rerunning.
5. **Options are one segmented row:** 44px tall, equal columns, and only the selected option carries a
   one-line description. The recommended option is marked by a dot, never a ribbon or a badge, and no
   badge repeats an option's name.
6. **On a phone, Download and Share are pinned at the bottom of the card.**
7. **A second method is offered only once the first falls short** (§3). Compress's "Turn pages into
   pictures" switch appears only when a result fell short (the images could not be recompressed, gave
   no gain or only a slight one, or missed an exact-size target), or when it is already on. Its hint
   names only what this file would lose: for a PDF with no text it reads "The smallest size for scans.
   Small detail gets softer.", with no warning about text or links that are not there.

The test, with a file loaded: at 1440x900 the before/after preview is fully inside the first
viewport; at 375x812 the result area and the pinned Download are. No row above the result is a line
of copy that could sit in the strip's note.

Below a loaded card there is one line: the airplane line, 16px under the card. Supporting SEO lines stay
in the HTML but hide once files are loaded, like the subhead. (MERGE-24, 2026-10-23)

## 19. Identity, linking and motion on the page grid

*(Merge polish, 2026-10-23)*

- Identity colour lives on the object: a 4px band on each page's top edge, not a floating dot. The
  danger colour is never a category colour; a clay token replaced it, since red read as an error.
  (MERGE-24, 2026-10-23)
- A list and the objects it owns highlight each other. Hover or keyboard focus (`:focus-visible` only)
  on either side lifts the linked items and steps the rest back. Nothing on touch, nothing during a
  drag, and links clear when the source is removed. (MERGE-24, 2026-10-23)
- Objects arrive with a short fade and rise as they render, and a completion moment (the bands sweep to
  one colour as the saved check draws) marks the export. Both are skipped under reduced motion. (MERGE-24, 2026-10-23)

## 20. One page grid, identical in every tool

*(GRID epic, 2026-10-24)*

- A tool that shows a document's pages shows them through the shared page grid and workspace
  (`src/shell/pageGrid/`, `src/shell/pageWorkspace/`): the same cell size, the same rotate, skip and
  preview cluster in the same place, the same drag from anywhere on the page, the same keys, the same
  Undo/Redo stack and the same background-prepared Download. A tool composes them; it never grows its
  own grid. `e2e/cross-tool/page-grid-parity.spec.js` holds the tools to it. Design record:
  [docs/shared-page-grid.md](./shared-page-grid.md). (GRID-01 to GRID-04, 2026-10-24)
- The number under a page is where it lands in the output; the preview and the cell's label name the
  source page. (GRID-04)
- A tap on a page selects it; nothing destructive hangs off a tap on the page body. (GRID-04)
- The rail runs in order of consequence. A one-file tool (Edit PDF, Split, PDF to Image): the choice
  that defines the output first (Split's One PDF or one per page, PDF to Image's format, quality and
  output, Edit PDF's page numbers), then which pages (the range field, Include all, Skip all, Invert),
  then Download and the hand-offs, and Replace file as a quiet last line: starting over with another
  file is an ending, not a first step. Quiet means one shared line (`ReplaceFileLine` in
  `src/shell/pageWorkspace/`): the replace glyph and label, no border or fill until hover, centred
  under the full-width hand-off row. It appears once, at every width; below 1024px the pinned rail
  sits under the last page, so it is never repeated in the phone bar. Merge keeps section 4's order,
  because its file list is its first decision; its Add files and Clear all files carry an icon each,
  the way the hand-offs do. (Shlomi, 2026-10-26) The rail sits at the end of the reading line, after the pages: they are what a
  person checks first, and Download closes the path. (Shlomi, 2026-10-25)

## The review questions

Every tool review answers these.

1. What is the output, and is it the centre of the loaded state?
2. What is the shortest path for the common case, and does any step exist only to make a button
   appear?
3. Which controls appear before an output exists, and why?
4. Is every row one kind of thing, in the order inputs, status, commands, setting, primary, next
   steps?
5. Is the output named, honestly counted, and renameable?
6. Which actions confirm, and could they undo instead?
7. What happens on a 72px cell with a finger?
8. Do Hebrew names survive every place a name is shown?
9. How long until the first visible row renders, and after a restore?
10. What does the person do next, and does the done state say so?
11. If a setting changes the shape of the output, does the canvas change shape with it, and can the
    person reach the setting without scrolling away from the canvas?
12. Does any preview transform (rotate, zoom, fit) crop more of the page than the untransformed
    preview did, checked with a fixture that has real content near an edge, not a blank or centred one?
13. On a phone, can anything cover what the person is editing, can a swipe on the page move something
    they had not selected, and does the tool still work on a scan where nothing is detected (§17)?
14. Does anything claim what the form needs (a gap, a count, a next field), and does every tap do
    exactly what the person chose?
15. With a file loaded, is the result in the first viewport (the preview at 1440x900, the result area and pinned Download at 375x812), is a second method offered only after the first fell short, and is every row
    above it earning its height (§18)?
