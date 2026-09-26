# Sign, next generation: guidelines

*Draft of 2026-09-25, normative for every SNG ticket. Revised 2026-09-26 after SNG-14: the platform's
own next and previous replaces our own ∧ ∨ throughout.*
- **The why and the plan:** [sign-next-gen.md](./sign-next-gen.md). It holds the pains, the causes, the iOS learnings, the competitors and the principles P1-P8. Its §5 is cited here as P1-P8.
- **The SNG-14 spike:** [backlog/tasks/SNG-14.md](../backlog/tasks/SNG-14.md) is the evidence behind every "SNG-14" citation here: measured on the iOS 26.2 Simulator, then run by Shlomi on his own iPhone and on desktop Chrome, 2026-09-25/26.
- **App-wide UX rules:** [ux-design-guidelines.md](./ux-design-guidelines.md), cited as UX§n. This document adds only what an editor on a phone needs, and never restates them.
- **Existing behaviour carried forward:** `.claude/rules/editor.md` and the code, cited at file:line.
- **Field detection and per-document memory** are logic, not UX, and any next-gen surface calls them rather than re-deriving them: `.claude/rules/editor.md`, "Document memory and field detection". This document never restates them.
- **Markers:**
  - "(proposed)" is a rule the owner has not yet ruled on.
  - "(open)" is a decision listed in §12.
- **Layout per form factor** follows the direction chosen in SNG-02. The canvas is https://claude.ai/artifact/2zhdweqZqXLd5LjmpWsGay. Everything else here is direction-agnostic.

## 0. North star

Open a form on a phone. The keyboard's own next and previous hop between fields, zoomed in so each one is readable: a wrong or missing suggestion costs one tap, never more. A tick lands in its box, text sits on its line, and nothing on the page is guessed for you. Sign it, look over what you added, and share it. The page never jumps on its own, no control covers what you are filling, nothing moves or resizes unless you meant it, and every change can be undone. The file never leaves the phone.

## 1. The page is an image, and the person is the guide

**The owner's premise, 2026-09-25:** "impeccable ux based on raster with user guidance assuming low precision and recall" (`docs/sign-next-gen.md` §5.6). It replaced the day's earlier model, in which found fields were marked, walked, counted and flagged when empty.

**The mental model, 2026-09-25, final:** "allow user to move between elements zooming on those detected, with false positives and false negatives as first class citizens" (the owner). Detection may suggest where to go; it still never claims what the form needs.

**Why, beyond the measurements:** even perfect detection could not know which blanks are this person's to fill. An employee's form leaves the employer's section blank on purpose. "Check the following if they apply" makes an unticked box a correct answer. Whether a blank is a gap is a judgment about intent and context, not about the page. So the app never flags a blank or counts what is left, and a wrong or missing suggestion is treated as ordinary, not as a mistake to correct.

**Marks are as central as text:** text, a tick, a cross, a circle, a strike, initials, a signature, a date.

**The model, revised after SNG-14 (2026-09-25/26):**
- Elements are the detected ones and the ones the person adds. Once on the page, both are equal. Writing spots are real, focusable fields; ticks, crosses and other marks are never stops, only taps (§3).
- The platform's own next and previous do the hopping between fields, in reading order, across pages: there are no arrows of our own (§3). Landing on a field zooms the view onto it so it is readable, with its printed label in view. There is no count and no progress over elements.
- A hop focuses a real field: the caret is live at once, ready to type. A hop never shows move or resize handles.
- False positives and negatives stay first-class, and cheap. A wrong guess costs one extra press of next and never reaches the file. A missed spot is one tap. An empty field made by a tap disappears when left. There is no "Remove" and no verdict UI (§3).
- A tap on a spot nothing marks adds a field there (Text by default), lined up with the print by the local help (SNG-09), and it joins the hop order at once. A tap within half a fingertip (22px) of a detected spot, or on its printed label, goes to that spot instead of creating a new one (§2.5).
- Move and resize are intentional: handles appear only after a direct tap on an element. Only a selected element moves or resizes. A pinch only zooms and never moves or resizes anything (a second finger cancels any one-finger claim, §2.2).
- Pinch is the zoom. Pinching out past the whole page switches to a grid of pages only deliberately (§4); a "Pages" control in the bar does the same.
- The document takes the screen: one row of bar (44px targets), no second row, minimal gutters around pages, no redundant lines of copy, no persistent coach bands (a first-open hint, if any, disappears on first use).
- Right actions in right context: the one bar changes with the moment (§2.6).
- A scan and a typed PDF behave the same. (Open: whether a fillable PDF's own fields are filled silently underneath.)
- The finish shows what you added, never what you missed.

**Copy never says** "missed", "empty", "N fields" or "all done". The finish says "Here's everything you added."

**The first-open hint** follows the chosen model (SNG-02); proposed: "Zoom in, choose what to write, and tap where it goes."

## 2. Interaction grammar

### 2.1 States

| State | Definition |
|---|---|
| idle | No tool armed, nothing selected. One-finger scroll is native. |
| tool armed | One placement queued; the next qualifying tap commits it and disarms (editor.md: tools are one-shot). |
| tool locked | Stays armed after every placement until changed. Production's rule is a double-tap/double-click lock (SIGN-30/31, `toolArming.js`); SNG-14's throwaway page instead kept tick and cross locked by default, and whether production should too is still open (§12 #21). |
| editing text | The caret is live in a focused field: reached by the platform's own next/previous, by a tap that lands on or adds a field, or by a direct tap on an existing text element. No handles. |
| element selected (handles) | Reached only by a direct tap on an element. Handles for move and resize; the bar offers Duplicate/Delete. |
| gesture | Exactly one of drag, resize, create or pinch at a time, DOM-owned, committed once on release through `controller.ts`. |
| signature sheet | Modal to the workspace until dismissed. |
| finish (the grid of pages) | the zoomed-out look at what you added; a tap on one of your marks opens it |

**Illegal, and unrepresentable in the machine (P4):**
- editing without a specific element focused;
- a tool armed while an element is selected: selecting disarms, and arming clears the selection;
- two gestures at once;
- any gesture or armed tool while the signature sheet or finish is open.

### 2.2 Touch (phone and iPad)

| Input | Outcome |
|---|---|
| Tap, within reach of a detected spot (§2.5), or on its printed label | Goes to that spot. Between two rows, the field whose label was tapped wins (SNG-14). |
| Tap, clearly away from any detected spot | Adds a field there (Text by default), lined up with the print by the local help (§1, SNG-09), and it joins the hop order in reading order. |
| Tap, empty page, while editing text | Ends typing only; nothing new is created. An empty field left this way disappears, with no undo step. A second tap on that same spot adds a field (SNG-14). |
| Tap, the page, an element selected (handles) | Deselect: one level per tap, as Escape. |
| Tap, the page, a tool armed | As today: the tool places its mark and disarms, unless a double-tap locked it (SIGN-30/31). Date fills today's date once, in production's date formats, then returns to Text (SNG-14). Whether ticks and crosses stay armed by default is open (#21). |
| Tap, unselected element | Selects it with handles (a direct tap; §2.1). A text element also opens for editing in the same tap (MOBI-21). |
| Tap, the selected element | Text re-opens editing. Anything else is acted on through the bar. |
| One-finger drag, blank page or an element that is not selected with handles | Native scroll. The element ignores the touch (owner, 2026-09-25). |
| One-finger drag, an element selected with handles | Move, after the slop (§2.5), clamped to the page, RTL-aware. |
| One-finger drag, a handle | Resize. |
| A second contact, at any phase | Cancels any pending or live one-finger claim, restores the DOM, and the two contacts pinch (decided, P3). The contact is checked at start, move **and** release (regression 2, sign-next-gen.md §1): under Pointer Events, a second `pointerdown` while one pointer is active; under Touch Events, `touches.length > 1`. Which event model the router uses on iOS is spike question (g), so this rule is written for both. The grace window before a first contact may move anything is §2.5's, and it is proposed. |
| Two-finger pinch or pan | Always zoom, around the midpoint (§4); never moves or resizes an element. Zooming out meets a stop at the whole page; a further pinch past a threshold, committed on release, switches to the grid of pages, with hysteresis on the way back; the bar's "Pages" control does the same switch. |
| Pinch, in the grid of pages | Pinching into a page opens it. |
| Double-tap, page | Unbound (open #1). |
| Double-tap, a tool | Locks it (`toolArming.js`, SIGN-30/31). |
| Long-press | Unbound (open #2). |

### 2.3 Mouse

| Input | Outcome |
|---|---|
| Click | Blank page: with something selected, deselect; otherwise place the chosen mark, as a tap does (proposed, open #3; SNG-06 confirms it on desktop). Element: selects it with handles (§2.1). Second click of a double-click on text: edit. Second click on a tool: lock. |
| Hover | Near a detected spot, shows a "droppable" preview of what the armed tool would place there (§1, §4); never reveals handles. Only a click does (§2.1). |
| Drag | Any element: select and move in one gesture (desktop convention; the touch-only rule is scoped to coarse pointers, open #4). A handle resizes. |
| Wheel | Native scroll. |
| Ctrl/Cmd + wheel | App zoom in steps, around the pointer; browser zoom is prevented inside the surface. |

### 2.4 Keyboard

| Input | Outcome |
|---|---|
| Tab / Shift+Tab | Hops between fields, detected and added alike, in reading order (§3): the platform's native tab order over real, focusable inputs. Otherwise native tab order elsewhere on the page. |
| Return, in a single-line field on a printed line | On touch, native: the keyboard's own return key reads "next", "done" on the last, because the field is a real single-line `<input>` in reading order (SNG-14). On desktop, Return does not hop; Tab and Shift+Tab do (row above). |
| Return, in a box on open space | New line. |
| Escape | One level per press: editing (ends typing), then selected (handles) if the element still shows them, then idle; armed, then idle. |
| Delete / Backspace | Deletes the element selected with handles, unless focus is in a text input. |
| Arrows, Shift+Arrows | Nudge the element selected with handles 1 / 10 screen px (proposed; WCAG 2.5.7, §7). |
| Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, Ctrl+Y | Undo, redo. Ignored while typing (`useHistoryShortcuts.js`). |
| Cmd/Ctrl + and −, Cmd/Ctrl+0 | Zoom step in and out, fit width. |

### 2.5 One set of constants

All are in screen px and ms. None scale with zoom.

| Constant | Value | Basis |
|---|---|---|
| Slop before an element follows a finger | 8px | Today's `TAP_MOVEMENT_TOLERANCE_PX` only reclassifies after the element has already moved. Now it gates the follow. |
| Second-finger window before any visible move | 75ms (proposed; SNG-03 sets it) | P3: a second finger always wins. |
| Tap maximum duration | 500ms | `TAP_HOLD_LIMIT_MS`, `DEFAULT_TAP_MAX_DURATION_MS` |
| Double-tap interval | 400ms | `DOUBLE_TAP_MS`, `toolArming.js` |
| Reach to a detected spot, or its printed label | 22px ("half a fingertip") | SNG-14: a 10px tolerance missed at the zoomed-out view, where a whole printed line is about 9px tall. Between two rows, the field whose label was tapped wins. |
| Minimum touch target | 44px | UX§8, Apple HIG |
| Handle hit area | 44px, shrinking toward a 24px floor so it never overlaps a neighbouring handle (proposed) | Regression 2: four 44px squares on a 4px checkbox form one pad |

The machine owns these. No listener defines its own threshold.

### 2.6 The bar has a measured budget

One bar, one row, and it changes with the moment (right actions in right context, owner, 2026-09-25). SNG-14 confirmed there are no arrows of our own in it anywhere: the platform supplies its own next/previous (§3), and a page cannot add controls to the platform's own keyboard bar in any case.

- **Nothing selected:** the tools (Text, tick, cross, signature, date), with the armed one shown, plus Undo and the finish.
- **Typing, on touch:** the platform's own keyboard bar only. Ours hides: it cannot add controls to that bar, and a fixed bar of ours would fight it or ride out of view under it (SNG-14).
- **A direct tap on an element (handles showing):** production's controls for that element, plus Duplicate and Delete.
- **The grid of pages:** Download and Share.

On desktop there is no keyboard bar to hide behind, so ours always stays, showing whichever of the above applies (SNG-14 confirmed this on Chrome).

Counted across all four contexts that is still more than today's twelve-control toolbar, which `editor.md` ("Main toolbar layout") shows is already at the edge of a 375px screen, so no single context may exceed it.

The rules:
- Each context shows at most what fits one row of 44px targets at 375px. There is no second row.
- Everything else goes to a "More" sheet.
- Gutters around the pages are kept to a minimum, and no line of copy repeats what a control already says: the document takes the screen, not the chrome around it.
- The exact content of each context is measured at 320, 375 and 430px in SNG-03 before any build.

## 3. Hopping between elements

**There are no arrows of our own.** The platform's own next and previous do the hopping between fields, in reading order, across pages: iOS's ∧ ∨ above the keyboard, Tab and Shift+Tab on desktop, the keyboard's Next key on Android (SNG-14; confirmed on the iOS 26.2 Simulator, on a real iPhone, and on desktop Chrome). A page cannot add, style or hide these controls (WebKit source: the accessory view lives in the UI process, not the page). Detection's only two jobs are the order the platform's controls follow, and where a tap lands.

**Every detected writing spot is a real, focusable field**, in that order:
- **Hittable at its centre.** WebKit's `nextAssistableElement` hit-tests the next field's centre and skips it as "obscured" if that point lands on something else; `pointer-events: none` on an invisible field greyed out both arrows in the spike (SNG-14).
- **The document itself must scroll it into view.** A field moved by a transform inside a fixed frame, or inside a scroll container that isn't the window, goes unreachable once it's off-screen; only the window as the scroller reached every field (SNG-14).
- **Tick boxes are never stops.** iOS's arrows skip real checkboxes, matching WebKit's `isAssistableElement`, which covers text fields, textareas, selects and contenteditable only. Ticks, crosses and other marks are reached by tap, never by hopping (§1).
- **Each printed line is its own single-line field.** A multi-line box turns the keyboard's "next" into a plain return and strands the person: this is what happened on a multi-line Address field before the fix (SNG-14).
- **A field added by a tap joins the order at once.**

**Order** is a document property and never depends on the UI's language:
- rows cluster by top edge (`ROW_TOLERANCE_PERCENT`, `fieldOrder.ts:41`);
- within a row, it starts at the page's printed start edge (`fieldOrder.ts:47-51`);
- pages go in ascending order.

**At the ends.** Because the arrows are the platform's, they can only move focus between real fields; they can never jump to a screen of ours.

| Position | Previous | Next |
|---|---|---|
| First field | The platform disables it | Goes to the next field |
| Last field | Goes to the previous field | The platform disables it: no field of ours follows |

Reaching the finish is not part of the hop. Leaving the last field (Done, or a tap elsewhere) returns to the "nothing selected" bar, where the finish is one tap away (§2.6). There is no count and no progress bar: regression 1 (Next jumping to the bottom of the document) cannot recur, because there is no field-language-dependent arrow of ours to swap.

- **After a deletion,** the selection clears and focus resumes from "nothing selected."

**The return key.** On touch, it reads "next" on every field and "done" on the last, natively, because each field is a real single-line input in reading order (SNG-14): no interception is needed, and none is possible, since a plain `<input>` cannot hold a line break in the first place. On desktop, Return does not hop; Tab and Shift+Tab do.

**The keyboard.** The text keyboard, always; digits are reached through its 123 key, never a guessed number pad. Dates are typed like any other text.

## 4. The viewport and the reveal

**Zoom** is app-owned (P1):
- The range runs from the whole page, through fit width (the resting zoom), to a max that the iOS canvas cap allows (SNG-03 (d); 3x is the working ceiling).
- **Pinch:** a CSS transform during the gesture with the midpoint fixed under the fingers. On release, one re-layout and one pdf.js re-render at the settled scale, with the focal point unmoved. Never re-centre: a view that moves on its own loses the person (MOBI-22, MOBI-25).
- **Zoom buttons** (−, %, +, Fit) are the single-pointer path (WCAG 2.5.1). They live in the bar (§2.6).

**Who moves the camera.** The app moves or zooms the view only on:
- a field gaining focus, however it got there (the platform's own next/previous landing on it, or a tap that lands on or adds it): the view zooms onto it so it is readable, with its printed label in view (§1, §3);
- entering or leaving the grid of pages (the finish);
- a tap that writes at a zoom where the text would render under 16px (open #19). This is also how a person at fit width sees at once which line the element landed on.

Any other tap opens what it touches where it is, at the zoom the person chose. A plain pinch is the person's own zoom and wins everywhere else (proposed, open #11).

**The grid-switch threshold.** Zooming out meets a stop at the whole page. Only a further pinch, past a threshold and committed on release, switches to the grid of pages; the way back has hysteresis, so a small correction does not flip the view again. The bar's "Pages" control makes the same switch without a pinch.

**The reveal:**
- A field gaining focus lands about a third of the way down the visible area, above the keyboard, so its printed label above it stays in view (SNG-14).
- It is zoomed so the typed text is at least 16px physical, and comb cells are at least 28px wide.
- **Reduced motion** lands directly, with no transition.

**The iOS order of operations is fixed** (sign-next-gen.md §3):
1. Select or create the field, and focus an input that already exists, synchronously inside the tap.
   - The constraint is settled: iOS raises the keyboard only this way (MOBI-24).
   - **The mechanism for a newly created field (spike (c)):** SNG-14 confirmed the outcome: the keyboard stayed up when a tap added a field, in the Simulator and on a real iPhone. The composer handoff itself (an always-mounted input kept as the editor, or handed to the box's own control) is an implementation choice for the ticket that builds it, not a decision for the owner.
   - The fallback, if the handoff fails, is that the always-mounted input remains the editor. That is direction A's composer.
2. Only then reveal, on the next frame.
3. One pending reveal at a time: a later move cancels an earlier one (`useFieldNavigation.ts:141-147`).
4. A keyboard that is still opening re-runs the reveal once, on the `visualViewport` resize (`revealFieldAfterKeyboard`, `useFieldNavigation.ts:287-308`).
5. **On iOS 26, `window.scrollY` already equals `visualViewport.offsetTop`** while the keyboard is up (SNG-14, confirmed on the Simulator). The reveal math must not add `offsetTop` again on top of scroll-based positioning, or it double-counts and the target lands behind the keyboard bar (§11 item 4).

**Rendering:**
- A transform during a gesture, never a re-render mid-gesture.
- Visible pages only in canvas memory, and tiles above a zoom threshold.
- `PdfPageCanvas.tsx` renders at a fixed `scale: 1.5` with no device-pixel-ratio factor today. At `1.5 × zoom × DPR 3`, one US Letter page reaches the iOS 16.7M-pixel canvas cap at about 1.3x past today's render, so visible-pages-only rendering is load-bearing.

## 5. The finish: what you added

- **Every page, zoomed out** (the grid of pages), with the person's own marks highlighted. A tap on one opens it to fix; nothing is filled from the overview itself.
- **Nothing is flagged as missing.** Not the employer's section, not an unticked "check the following if they apply" box: the page alone cannot say which blanks are this person's, so the finish never marks one empty.
- **Copy:** "Here's everything you added."
- **Ending:** Download and Share, using the file MOBI-07 already pre-generates. Share leads on a phone (UX§8).

## 6. Undo

- **Every committed change is one undo step:** add, delete, move, resize, style, and one step per text-edit session (UNDO-04, P5).
- **Undo and Redo are always visible in the bar.**
- **Feedback (open #8, row D on the canvas).** Recommended:
  - a 5-second chip for a **delete** ("Signature deleted · Undo"), which takes something out of view (UX§6);
  - **no chip** for moves, resizes or typing. Instead, the Undo control names what it will undo ("Undo move"), because a chip after every intended move is noise on a small screen.
- **Every undo is announced** through the live region ("Move undone").

## 7. Accessibility

**VoiceOver:**
- Its one-finger gestures are handled before the page sees them, so `touch-action` does not affect them [S2][S3].
- A VoiceOver user reaches two-finger gestures only through passthrough, so **the zoom buttons are the zoom path**, not a convenience.
- iOS Zoom (three-finger double-tap) still works over the page [S4].
- **VoiceOver does not run in the iOS Simulator** [S5]. Every VoiceOver claim is confirmed on a real iPhone before a ticket closes.
- The platform's own next/previous (§3) are a different control from VoiceOver's own navigation; SNG-14 exercised the sighted, non-VoiceOver path only. A VoiceOver pass over the same fields is still owed before a ticket touching them closes.

**Must, and testable:**
- **Focus order is DOM order:** the bar, then the page's fields in reading order (§3), then the person's other marks.
- **One polite live region** announces a field gaining focus, by kind and page (for example "Text, page 1"), placements, undo and the finish. Numbers inside RTL copy are isolated (`<bdi>`, UX§9).
- **Every mark has an accessible name** from its kind and page ("Tick, page 1"); a text mark also reads its text. Never blank, never an id.
- **Contrast.** Every mark state (placed, selected, being typed in) and the finish's highlight reach 3:1 against the page (WCAG 1.4.11).
  - **Blocked by QUAL-04:** `--color-border-strong` (`#6fbeb2`) is 2.07:1, so no mark, highlight or selection outline may use it as its only boundary.

**WCAG 2.2 AA mapping:**

| Criterion | Met by |
|---|---|
| 1.4.10 Reflow | The editing-toolbar exception [S6]; the bar's own controls still wrap |
| 2.4.11 Focus not obscured | No bar, sheet or reveal may fully cover the focused field; the reveal positioning in §4 is aimed at this (spike (b)) |
| 2.5.1 Pointer gestures | Zoom buttons for pinch |
| 2.5.7 Dragging movements | Arrow nudges on a keyboard. On touch, the non-drag path is **open #9**: tap-to-move and a resize stepper in the bar are the candidates |
| 2.5.8 Target size | 44px targets, and a 24px floor for handles |
| 1.4.4, 2.1.1, 2.4.3, 2.4.7, 3.3.1-2, 4.1.2 | As above, and real `<button>`/`<input>`/`<label>` everywhere |

## 8. RTL and bidi

Builds on UX§9.

- **The reading order belongs to the document**, and the UI's direction belongs to the language. These are two independent axes.
  - The 09-20 regression conflated them.
  - Machine tests vary each axis on its own, and a Playwright fixture covers each combination: an RTL document in the English UI, and an LTR document in the Hebrew UI.
- **The platform's own next/previous need no mirroring from us.** iOS and Android draw their own chevrons and Next key, not our page (§3). Any icon we do draw (Duplicate, Delete, Pages, Download, Share, the tools) follows the ordinary rule: direction-carrying icons mirror in `/he/`, neutral ones don't.
- **Text growth:** RTL boxes keep a fixed right edge and grow leftward (`registry/text.ts`, `writeDOM`).
- **Comb cells are placed by index** and never reordered by bidi (wysiwyg-text-architecture.md §1.1).
- **A tap-local snap on an RTL page** anchors the box's start edge on the right.

## 9. Performance budgets

| Budget | Target | Measured by |
|---|---|---|
| Pinch | 60fps, transform only | rAF timestamps during a scripted pinch |
| Settle to crisp after a pinch | set in SNG-03 | pointerup to `renderTask.promise` |
| Reveal | one motion budget, instant under reduced motion | rAF |
| Time to first page | set in SNG-03, never worse than today | `perf` Playwright project |
| Canvas memory | per canvas under 16.7M px; the total re-measured on iOS 26 [S7] | Simulator |

## 10. Testing

| Layer | Proves | Cannot prove |
|---|---|---|
| The pure machine and router, fed synthetic pointer streams | every MOBI regression as one transition test (P7) | layout, keyboard, real dispatch |
| Vitest DOM | committed state, ARIA, live-region text | real rects, `touch-action`, focus timing |
| Playwright WebKit iPhone project | real WebKit layout and CSS | a synchronous focus raising the keyboard, the platform's own next/previous hopping, multi-touch, VoiceOver |
| **iOS Simulator gate** (SNG-07) | the gaps above, except VoiceOver | VoiceOver |

**The Simulator driver:**
- **`safaridriver`** with `safari:useSimulator` [S8]: real WebDriver, JS, DOM and taps.
- **`xcrun simctl io recordVideo`** for evidence.
- **Appium XCUITest in reserve**, only if safaridriver's multi-touch cannot pinch [S9].
- Playwright's WebKit never drives the Simulator [S11]. It stays the earlier, cheaper gate.

**The smoke run.** Each step is asserted from page JS where it can be, and otherwise on video:
- pinch;
- hop through fields with the platform's own next/previous, across a page boundary (SNG-14);
- tap to type with the keyboard up;
- placing a tick and a signature;
- finish;
- tap outside;
- undo a move;
- and, on a scan, tap to write with the snap.

## 11. Review checklist and definition of done

**Every SNG change that touches touch, zoom, focus or the keyboard answers:**
1. Is focus moved synchronously in the gesture handler, on an input that already exists? (For a newly created field, SNG-14 confirmed the outcome works; the composer handoff is implementation, spike (c).)
2. Is every text input's computed font size at least 16px (SNG-14: the reveal zooms until this is true)?
3. Is `touch-action` set on the surface and every descendant, without breaking caret placement, selection or the loupe inside the focused input (spike (e))?
4. Is nothing read from `visualViewport.offsetTop` (SNG-14: on iOS 26 it's already folded into `window.scrollY`; adding it again double-counts and misplaces the reveal)?
5. Is a second contact handled at start, move and release, in the router's event model?
6. Is there no new floating element chrome, and does no Floating UI middleware close over render values?
7. Is any fixed bar of ours verified with the keyboard up: hidden on touch, still visible on desktop (§2.6, SNG-14)?
8. Has it run on the iOS Simulator gate?
9. Is there an RTL-document case, independent of the UI's language?
10. Does every newly committed change have its own undo entry?
11. Does every drag have a non-drag path?
12. Can anything fully cover the focused field?
13. Is reduced motion respected?
14. Are accessible names and roles verified?
15. Does it behave the same on a scan and a typed PDF, and does nothing claim what the form needs (a gap, a count, a required field)?

**Done means:**
- all 15 answered in the commit or ticket;
- the Simulator smoke run green, with video;
- every WCAG row it touches re-verified;
- an RTL fixture wherever reading order, focus or the keyboard is touched;
- VoiceOver claims confirmed on a real iPhone;
- the full `ci.yml` chain green;
- any learning written here or in editor.md, not left in a commit body.

## 12. Open decisions (for the owner)

| # | Decision | Recommendation |
|---|---|---|
| 0 | The mental model for reading and filling a page about 2.5 times wider than the phone | **Decided (owner, 2026-09-25):** hop between elements, zoomed in, via the platform's own next/previous (refined by SNG-14); detection suggests where to go, and false positives and false negatives are first-class |
| 1 | Double-tap on the page | Leave it unbound: double-tap already locks a tool, and no competitor zooms on it |
| 2 | Long-press | Leave it unbound until a real need is named |
| 3 | What a tap on the page places | The chosen mark, Text by default |
| 4 | "Only a selected element moves" | Touch only; the mouse keeps select-and-drag |
| 5 | Previous (∧) with nothing selected | **Superseded by SNG-14:** the platform's own next/previous only appear once a field has focus; our "nothing selected" bar has no arrows to disable (§2.6, §3) |
| 6 | Checkboxes, dates and signatures in the hop order | **Superseded by SNG-14:** checkboxes are never native stops: WebKit's `isAssistableElement` covers text fields, textareas, selects and contenteditable only, and skips real checkboxes regardless of our markup. Ticks and crosses are reached by tap, not by hopping (§1, §3). A date typed as text remains a stop. Whether a signature spot can be one, or is reached by tap like a tick, is now open |
| 7 | Dates | Typed into the printed cells, not the iOS date wheel |
| 8 | Undo feedback (row D) | A chip for a delete; a named Undo for moves, resizes and typing |
| 9 | The non-drag path for move and resize on touch (WCAG 2.5.7) | A move/resize stepper in the selected element's bar controls (open) |
| 10 | Handle hit areas | 44px, shrinking toward a 24px floor, never overlapping |
| 11 | When the app may move the camera | On a field gaining focus however it got there, on entering or leaving the grid of pages, and on a tap that writes below the readable zoom (§4) |
| 12 | Dismissing a false positive | **Superseded by SNG-14:** there is no "Remove" and no verdict UI. A false positive costs one extra press of next; nothing needs to dismiss it (§1, §3) |
| 13 | What each bar context holds at 375px (§2.6) | The four contexts are in §2.6 (revised by SNG-14); exact fit at each breakpoint is measured in SNG-03 |
| 14 | Saving the current hop in the draft | Decided: yes, the last field's position is remembered so the view can return there, but nothing is focused after a reload, since iOS raises no keyboard without a tap (§13) |
| 15 | `interactive-widget=resizes-content` on the editor page | Yes. Android honours it and iOS ignores it (WebKit bug 259770) |
| 16 | Counts and field names | No counts or field names anywhere |
| 17 | The precision floor for a mark, a stop or a highlight | Superseded: no floor; every detected writing spot becomes a field in the hop order, and a false positive is handled by being cheap to pass, not filtered out. Marks like checkboxes are tap-only, never stops (§1, §3, SNG-14) |
| 18 | The keyboard when writing text | The text keyboard always |
| 19 | A tap that writes below the readable zoom | The camera reveals the new field, the same as any field gaining focus (§4) |
| 20 | Fillable PDFs: fill their own fields silently underneath, or treat them as images too | Open |
| 21 | Whether a tick or a cross stays armed after a tap by default, instead of today's one-shot with a double-tap to lock | Open. SNG-14's throwaway page kept them armed until changed, and that is what Shlomi's iPhone and desktop runs were tested against; production's current rule is still one-shot with a double-tap lock. Not decided either way |
| 22 | Whether hops are suppressed on a form where detection floods the page with false stops (HMRC SA100: 89 of 93 candidates wrong, `docs/sign-next-gen.md` §5.6) | Open |
| 23 | Handles only after a direct tap | Decided (owner, 2026-09-25): a hop never shows handles; only selecting an element with a direct tap does (§2.1-§2.3) |
| 24 | Accidental layout switch on a pinch | Decided (owner, 2026-09-25): a pinch only zooms; the grid of pages needs a pinch past a stop, committed on release, with hysteresis, or the bar's "Pages" control (§4) |
| 25 | How much of the screen is chrome | Decided (owner, 2026-09-25): one row, no second row; the document takes the screen (§2.6) |
| 26 | What the bar shows | Decided (owner, 2026-09-25; the four contexts revised by SNG-14): it changes with the moment, one of four contexts (§2.6) |
| 27 | Whether the hop control is ours or the platform's | Decided (Shlomi, 2026-09-25/26, spiked in SNG-14): the platform's own next/previous, no arrows of our own, on any platform (§3) |

## 13. Cases the rules must also cover

| Case | Rule |
|---|---|
| **Android Chrome** | The same model and rules. Hopping is the keyboard's own Next key, the same principle as iOS's chevrons and desktop's Tab (§3). Its `visualViewport` follows the spec, and it supports `interactive-widget=resizes-content`, which keeps a fixed bar above the keyboard by resizing the layout viewport (proposed for the editor page, open #15). The gate gets an Android emulator smoke run beside the iOS one (SNG-07). |
| **Landscape** | Supported. With the keyboard up, the bars compact to one row, the box being typed in still lands in the visible band, and nothing is forced to rotate. |
| **iPad Split View and Slide Over** | Layout follows width and input follows the pointer. Both change live, so state, selection and an open text session survive a resize. |
| **An external keyboard** (iPad, or a phone with one) | There is no soft keyboard, so `visualViewport` does not shrink. Tab and Shift+Tab hop between fields, natively (§3), and every §2.4 shortcut works. |
| **Drafts and reload** | Elements persist as today. The last field is remembered in the draft (§12 #14). Nothing else is auto-focused after a reload: iOS allows no keyboard without a tap, so one tap resumes typing. |
| **A pinch during a text session** | Allowed. Editing is a state, not a gesture, so the session and the keyboard stay open, zoom changes around the fingers, and the camera does not move afterwards (§4). |
| **The signature sheet's typed name** | Its input follows every keyboard rule here: at least 16px, focused synchronously on the tap that opens "Type", and the sheet stays above the keyboard. |
| **A stray tap** | Places the chosen mark if a tool is armed. While editing, a tap away only ends typing, and an empty field disappears when left (§2.2). Any other mark is one undo away. |
| **Yes/no rows (medical forms)** | Each box is reached by tap, not by hopping: WebKit's arrows skip real checkboxes entirely (§3), so an unwanted box never interrupts the walk through the text fields. A tick locked by a double-tap (as today) makes a column of ticks one tap each (open #21). Nothing guesses which box is yours. |
| **"Check the following if they apply"** | The box is reached by tap, not a hop (§3). Nothing flags it unticked, and skipping it costs nothing, because the platform's arrows never stop there in the first place. |
| **A section for someone else (the employer)** | Its fields are real text stops the person passes with next (∧ ∨ on iOS, Tab elsewhere; §3). Nothing flags them, and the finish only shows what you added. |
| **"Delete whichever does not apply"** | The strike pen runs a line through the word under the finger, centred on the text by the local help (SNG-09); the struck word becomes a mark like any other. These candidate words are reached by tap, not by hopping, like any mark (§3): nothing steps through them with next, and nothing flags the ones left unstruck. |

## Sources

- [S2] WebAIM, VoiceOver on mobile: https://webaim.org/articles/voiceover/mobile
- [S3] AppleVis, VoiceOver gestures: https://www.applevis.com/guides/complete-list-ios-ipados-gestures-available-voiceover-users
- [S4] Apple Support, Zoom on iPhone: https://support.apple.com/guide/iphone/iph3e2e367e/ios
- [S5] Apple Developer Forums 716937, no VoiceOver in the Simulator: https://developer.apple.com/forums/thread/716937
- [S6] W3C, Understanding SC 1.4.10 Reflow: https://www.w3.org/WAI/WCAG21/Understanding/reflow.html
- [S7] WebKit bug 190280, canvas memory: https://bugs.webkit.org/show_bug.cgi?id=190280
- [S8] Apple, Enabling WebDriver on iOS: https://developer.apple.com/documentation/safari-developer-tools/ios-enabling-webdriver
- [S9] Appium XCUITest driver: https://appium.github.io/appium.io/docs/en/drivers/ios-xcuitest/
- [S11] Playwright issue 37332, WebKit emulation is not mobile Safari: https://github.com/microsoft/playwright/issues/37332
