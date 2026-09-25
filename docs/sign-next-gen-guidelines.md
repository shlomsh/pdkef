# Sign, next generation: guidelines

*Draft of 2026-09-25, normative for every SNG ticket.*
- **The why and the plan:** [sign-next-gen.md](./sign-next-gen.md). It holds the pains, the causes, the iOS learnings, the competitors and the principles P1-P8. Its §5 is cited here as P1-P8.
- **App-wide UX rules:** [ux-design-guidelines.md](./ux-design-guidelines.md), cited as UX§n. This document adds only what an editor on a phone needs, and never restates them.
- **Existing behaviour carried forward:** `.claude/rules/editor.md` and the code, cited at file:line.
- **Markers:**
  - "(proposed)" is a rule the owner has not yet ruled on.
  - "(open)" is a decision listed in §12.
- **Layout per form factor** follows the direction chosen in SNG-02. The canvas is https://claude.ai/artifact/2zhdweqZqXLd5LjmpWsGay. Everything else here is direction-agnostic.

## 0. North star

Open a form on a phone. Tap where you want to write, or step through the spots we found, one at a time. Sign it, look over the whole page, and share it. The page never jumps, no control covers what you are filling, nothing moves unless you meant it, a wrong guess costs one tap at most, and every change can be undone. The file never leaves the phone.

## 1. Documents, detection and honesty

Detection is good on most typed forms, bad on some, and blind on scans; labels are weaker still (P6 has the measurements). Short term the editor assumes only reasonable precision and recall, not a model that reads forms (owner, 2026-09-25; the model step is SNG-12). So no detection error may cost the person more than it saves. There is one editor, one rule, and three document classes:

| Document | What we know | ∧ ∨ step through | Count | Review |
|---|---|---|---|---|
| Fillable PDF (AcroForm) | every field, from the file | its fields | "2 of 12" | "N empty", exact |
| Vector flat form | the spots found above the floor | the spots found, plus what you wrote | none | the found spots still empty, and "check each page" |
| Scan, or nothing found | nothing | what you wrote | none | every page zoomed out, to check yourself |

**The error budget** (P6). Every UI that shows detection is checked against it:

| When detection... | the person meets | cost |
|---|---|---|
| misses a field | a tap writes there anyway, lined up with the printed line | none |
| marks a non-field | a quiet dashed mark; "Not a field" at that stop removes it for good | one tap |
| guesses the wrong kind | a text box, with the guessed kind offered in the bar | one tap |
| guesses a wrong label | nothing: a guessed label is never shown | none |
| finds only part of the form | nothing counts or promises; review asks you to check each page | none |

Rules:
- **One rule: tap where you want to write** (§2.2). It behaves the same on a found spot, a missed one and a scan.
  - The new box lines up with the printed line or box under the finger, found locally (SNG-09). The snap declines rather than guesses: with nothing credible, the box lands exactly at the tap.
  - On a found spot, the box takes the spot's bounds.
- **The precision floor.** A found spot is marked, walked or highlighted only when detection clears 95% precision per corpus form, scored the way the person meets it (SNG-11, proposed, open #17). Below the floor, detection only snaps. Recall is never a UI promise.
- **Labels are never ours.** On a flat form or a scan, nothing names a field: not the bar, not review, not a toast. The walk frames the printed label with the field instead (§4). A fillable PDF's own tooltip may be shown, because the file says it (SNG-13). Accessible names state position, not meaning (§7).
- **Counts only come from the file.** "2 of 12" appears only on a fillable PDF. Found spots are never totalled (open #16).
- **Under doubt, the cheapest error.**
  - A tap makes a text box. The one exception is a found checkbox above the floor, which a tap ticks; the bar then offers "Text instead".
  - The kind detection guessed is offered, never applied: "Today" in the bar beside a printed "Date", "Sign" at a found signature line. Ignoring it costs nothing.
  - A text keyboard, never a guessed number pad (§3).
- **A field detection missed becomes a stop** the moment a box is placed on it, and it must join the walk in reading order.
  - This is new work (SNG-04/05), not existing behaviour. Today the walk is built only from detected regions (`useFieldNavigation.ts:326-330`).
  - `fieldPosition` (`fieldOrder.ts:236-246`) only navigates *from* an off-field box, never *through* it.
- **"Not a field."** At a found spot, the bar offers it (proposed, open #12). The mark disappears for good in this file, saved with the draft. The verdict becomes one more input to the one pure `reconcile` in `src/tools/sign/fields/fieldRegions.js`, where source and kind precedence are already data (`SOURCE_ORDER`, `KIND_PRECEDENCE`). It goes there, not into a UI-side filter.
- **Copy never claims completeness.**
  - Review: "1 spot we found is still empty. We can miss fields, so check each page too." With every found spot filled: "All the spots we found are filled. We can miss fields, so check each page too."
  - Never "All done", "12 fields" or "0 of 0". "Spot" is what we found; "field" is what the form has.
- **First open states the rule once,** in a dismissible line under the bar:
  - where something is marked: "Tap anywhere to write. We've marked the spots we found."
  - on a scan: "This page is a scan, so nothing is marked. Tap anywhere to write."
  - on a typed form with nothing above the floor: "We didn't mark anything on this form. Tap anywhere to write."
- **The FORM-09 question flow, and anything that speaks a field's meaning, waits for the model step** (SNG-12): per document, on the 90/90/85 bar.

## 2. Interaction grammar

### 2.1 States

| State | Definition |
|---|---|
| idle | No tool armed, nothing selected. One-finger scroll is native. |
| tool armed | One placement queued; the next qualifying tap commits it and disarms (editor.md: tools are one-shot). |
| tool locked | Re-arms after every placement until Stop (touch) or reselection (mouse). Entered by double-tap/double-click on the tool (SIGN-30/31). |
| element selected | The bar targets it; delete and (on touch) drag apply to it. |
| editing text | Always implies selected. The caret is live. |
| gesture | Exactly one of drag, resize, create or pinch at a time, DOM-owned, committed once on release through `controller.ts`. |
| signature sheet | Modal to the workspace until dismissed. |
| review | The zoomed-out check; a tap on a highlight returns to the walk there. |

**Illegal, and unrepresentable in the machine (P4):**
- editing without that element selected;
- a tool armed while an element is selected: selecting disarms, and arming clears the selection;
- two gestures at once;
- any gesture or armed tool while the signature sheet or review is open.

### 2.2 Touch (phone and iPad)

| Input | Outcome |
|---|---|
| Tap, the page, idle | **Write** (the one rule, §1; proposed, open #3): a text box at the tap, lined up with the printed line or taking a found spot's bounds, opened with the keyboard up. On a found checkbox, a tick. The same whether or not detection found anything there. |
| Tap, the page, something selected or editing | Deselect: one level per tap, as Escape. A box left empty closes and disappears, with no undo step. |
| Tap, the page, a tool armed | Place at the point, lined up the same way, and disarm unless locked. |
| Tap, unselected element | Select it. A text element also opens for editing in the same tap (MOBI-21). |
| Tap, the selected element | Text re-opens editing. Anything else is acted on through the bar. |
| One-finger drag, blank page or an **unselected** element | Native scroll. The element ignores the touch (owner, 2026-09-25). |
| One-finger drag, the selected element | Move, after the slop (§2.5), clamped to the page, RTL-aware. |
| One-finger drag, a handle | Resize. |
| A second contact, at any phase | Cancels any pending or live one-finger claim, restores the DOM, and the two contacts pinch (decided, P3). The contact is checked at start, move **and** release (regression 2, sign-next-gen.md §1): under Pointer Events, a second `pointerdown` while one pointer is active; under Touch Events, `touches.length > 1`. Which event model the router uses on iOS is spike question (g), so this rule is written for both. The grace window before a first contact may move anything is §2.5's, and it is proposed. |
| Two-finger pinch or pan | App-owned zoom around the midpoint (§4). |
| Double-tap, page | Unbound (open #1). |
| Double-tap, a tool | Locks it (`toolArming.js`, SIGN-30/31). |
| Long-press | Unbound (open #2). |

### 2.3 Mouse

| Input | Outcome |
|---|---|
| Click | Blank page: with something selected, deselect; otherwise write, as a tap does (proposed, open #3; SNG-06 confirms it on desktop). Element: select. Second click of a double-click on text: edit. Second click on a tool: lock. |
| Drag | Any element: select and move in one gesture (desktop convention; the touch-only rule is scoped to coarse pointers, open #4). A handle resizes. |
| Wheel | Native scroll. |
| Ctrl/Cmd + wheel | App zoom in steps, around the pointer; browser zoom is prevented inside the surface. |

### 2.4 Keyboard

| Input | Outcome |
|---|---|
| Tab / Shift+Tab | Walk Next/Previous while a field or element is selected (`PdfSignTool.tsx` keydown). Otherwise native tab order. |
| Return, in a box on a printed line or a found spot | Commit and go to the next stop. `enterkeyhint="next"` (`"done"` on the last) only relabels the key. The interception is separate (proposed, spike (f)): these boxes are a single-line `<input>`; Return is a `keydown` Enter that is not `isComposing`; and a `beforeinput` guard catches `insertLineBreak`/`insertParagraph`. |
| Return, in a box on open space | New line. The page decides: a printed line holds one line, open space holds a paragraph. |
| Escape | One level per press: editing, then selected, then idle; armed, then idle. |
| Delete / Backspace | Deletes the selected element unless focus is in a text input. |
| Arrows, Shift+Arrows | Nudge the selected element 1 / 10 screen px (proposed; WCAG 2.5.7, §7). |
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
| Minimum touch target | 44px | UX§8, Apple HIG |
| Handle hit area | 44px, shrinking toward a 24px floor so it never overlaps a neighbouring handle (proposed) | Regression 2: four 44px squares on a 4px checkbox form one pad |

The machine owns these. No listener defines its own threshold.

### 2.6 The bar has a measured budget

One contextual bar holds the tools, the walk (∧ ∨, with a count only on a fillable PDF), Review, zoom, Undo/Redo and Download. Row F on the canvas draws one version of each context. That is more than today's twelve-control toolbar, which `editor.md` ("Main toolbar layout") shows is already at the edge of a 375px screen.

The rules:
- Each context shows at most what fits one row of 44px targets at 375px. Undo, and the walk while filling, are always in it.
- Everything else goes to a "More" sheet.
- The content of each context is decided with the chosen direction (SNG-02), and measured at 320, 375 and 430px in SNG-03 before any build (open #13).

## 3. The field walk

- **Stops**, in reading order, are: the spots detection found above the floor (§1), every element the person placed, and on a fillable PDF, the file's own fields. Every kind is a stop:
  - comb/cell and text: open for typing, keyboard up (the ∨ tap focuses synchronously, §4);
  - a checkbox: framed, no keyboard; a tap or Space ticks it (MOBI-05);
  - a date: opens for typing into its printed cells;
  - a signature spot: framed, no keyboard, and the bar's primary action is "Sign". Arriving never opens the sheet, so a wrong guess costs nothing.
  - Today's walk skips checkboxes and signatures (`fieldOrder.ts:16-19`). The next generation includes them (proposed, open #6).
  - `detectFormFields` (`src/tools/sign/fields/detectFormFields.ts`, d7f8c817) already returns every checkbox, and every cell including the signature kind. Only `useFormFieldRegions.ts` filters signature cells today. So the walk reads the detection result directly, through the floor (SNG-11), with kinds from `fields/fieldTypes.ts`.
- **"Not a field"** is in the bar at every found spot that is still empty (§1).
- **Order** is a document property and never depends on the UI's language:
  - rows cluster by top edge (`ROW_TOLERANCE_PERCENT`, `fieldOrder.ts:41`);
  - within a row, the walk starts at the page's printed start edge (`fieldOrder.ts:47-51`);
  - pages go in ascending order.
- **Arrows are ∧ ∨:** up is Previous, down is Next, everywhere. `arrowDirection`'s document vote (`useFieldNavigation.ts:92-113`) retires with the left/right chevrons.
- **Next never skips a filled stop**, so stop 7 never depends on the path taken.
- **A count appears only on a fillable PDF** ("2 of 12", from the file). Elsewhere there is none: the stops are what we found, and a total would promise completeness. Review alone lists what is empty.
- **The boundaries.** Every press has one obvious destination:

| State | Next | Previous |
|---|---|---|
| nothing selected | the first stop | **disabled** (this fixes regression 1 by design) |
| the first stop | the second | disabled |
| the last stop | Review | the one before |
| in Review | the first empty stop, leaving Review there | the last empty stop, likewise; both disabled when none is empty |
| no stops yet (a scan, before anything is written) | disabled | disabled |
| after a deletion | selection clears; "nothing selected" applies | the same |
| during a gesture | inert (the machine refuses the event) | inert |

An element placed anywhere is a stop like any other, so it needs no row of its own.

- **The keyboard per stop.** `inputmode` follows the file, never a guess (open #18):
  - A fillable field whose format or `MaxLen` says digits gets `numeric`. `decimal`, `tel` and `email` likewise come only from the file.
  - A found spot is always `text`. iOS's number pad has no way back to letters, while the text keyboard is one tap from digits: the cheapest error (§1).
  - Dates are typed into the printed cells, not picked in iOS's date wheel (proposed, open #7). One model for every comb, and the digit order stays a fact of the document.

## 4. The viewport and the reveal

**Zoom** is app-owned (P1):
- The range runs from the whole page, through fit width (the resting zoom), to a max that the iOS canvas cap allows (SNG-03 (d); 3x is the working ceiling).
- **Pinch:** a CSS transform during the gesture with the midpoint fixed under the fingers. On release, one re-layout and one pdf.js re-render at the settled scale, with the focal point unmoved. Never re-centre: a view that moves on its own loses the person (MOBI-22, MOBI-25).
- **Zoom buttons** (−, %, +, Fit) are the single-pointer path (WCAG 2.5.1). They live in the bar, beside the walk and Review.

**Who moves the camera.** The app moves or zooms the view only on:
- a Next/Previous step;
- a jump from Review;
- entering or leaving Review;
- a tap that writes at a zoom where the new text would render under 17px. It is revealed like a walk step, because typing what you cannot read is not a choice anyone made (open #19). This is also how a person at fit width sees at once which line the box landed on.

Any other tap opens what it touches where it is, at the zoom the person chose. The person's own zoom wins everywhere else (proposed, open #11).

**The reveal:**
- The walked field lands in the upper third of the visible band, below the bar and clear of the keyboard, so its printed label above it stays in view.
- It is zoomed so the typed text is at least 17px physical, and comb cells are at least 28px wide.
- **Reduced motion** lands directly, with no transition.

**The iOS order of operations is fixed** (sign-next-gen.md §3):
1. Select or create the field, and focus an input that already exists, synchronously inside the tap.
   - The constraint is settled: iOS raises the keyboard only this way (MOBI-24).
   - **The mechanism for a newly created field is open** (spike (c)): an always-mounted input focused in the tap, then either kept as the editor, or handed to the box's own textarea while the keyboard stays up.
   - The fallback, if the handoff fails, is that the always-mounted input remains the editor. That is direction A's composer.
2. Only then reveal, on the next frame.
3. One pending reveal at a time: a later move cancels an earlier one (`useFieldNavigation.ts:141-147`).
4. A keyboard that is still opening re-runs the reveal once, on the `visualViewport` resize (`revealFieldAfterKeyboard`, `useFieldNavigation.ts:287-308`).

**Rendering:**
- A transform during a gesture, never a re-render mid-gesture.
- Visible pages only in canvas memory, and tiles above a zoom threshold.
- `PdfPageCanvas.tsx` renders at a fixed `scale: 1.5` with no device-pixel-ratio factor today. At `1.5 × zoom × DPR 3`, one US Letter page reaches the iOS 16.7M-pixel canvas cap at about 1.3x past today's render, so visible-pages-only rendering is load-bearing.

## 5. The review

- **Empty** means a stop with nothing on it: a found spot above the floor, or a fillable field. An unticked checkbox is an answer, not a gap, and is never highlighted.
- **How it looks:**
  - a citron highlight with a small "empty" glyph at its start edge, so it is never marked with colour alone (WCAG 1.4.1, 3.3.1);
  - no label tag on a flat form or a scan: the page's own printed label sits beside it. A fillable PDF may tag it with the file's own name (SNG-13);
  - the panel's line, from §1: "1 spot we found is still empty. We can miss fields, so check each page too."
- **Jumping back:**
  - One tap on a highlight, or ∧ ∨, returns to the walk at that stop, with §4's reveal and synchronous focus.
  - Nothing is filled from the overview, where a checkbox is too small to hit.
- **Ending:** Download and Share, using the file MOBI-07 already pre-generates. Share leads on a phone (UX§8).
- **On a scan**, review shows every page, zoomed out, with what the person added, and the §1 copy.
- **MOBI-33's accuracy review is separate.** If it ships, it runs before filling; this review runs last.

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

**Must, and testable:**
- **Focus order is DOM order:** the bar, then the page, then the fields in walk order.
- **One polite live region** announces the walk, undo, and review counts. On a fillable PDF: "Field 2 of 12, ID number", from the file. On a found spot: "Spot 2, beside "ID number"", a fact about position, with no total. Numbers inside RTL copy are isolated (`<bdi>`, UX§9).
- **Every stop and element has an accessible name.** On a fillable PDF, the file's own tooltip or readable name (SNG-13). On a found spot, its kind and the nearest printed text as a position ("Text, beside "ID number""), never a guessed meaning. Never blank, and never an id.
- **Contrast.** Every field state (empty, current, filled, empty-in-review, selected) reaches 3:1 against the page (WCAG 1.4.11).
  - **Blocked by QUAL-04:** `--color-border-strong` (`#6fbeb2`, the empty-field outline in the sketches) is 2.07:1. The chosen direction's polish must use a darker outline.

**WCAG 2.2 AA mapping:**

| Criterion | Met by |
|---|---|
| 1.4.10 Reflow | The editing-toolbar exception [S6]; the bar's own controls still wrap |
| 2.4.11 Focus not obscured | No bar, sheet or reveal may fully cover the focused field (spike (b)) |
| 2.5.1 Pointer gestures | Zoom buttons for pinch |
| 2.5.7 Dragging movements | Arrow nudges on a keyboard. On touch, the non-drag path is **open #9**: tap-to-move and a resize stepper in the bar are the candidates |
| 2.5.8 Target size | 44px targets, and a 24px floor for handles |
| 1.4.4, 2.1.1, 2.4.3, 2.4.7, 3.3.1-2, 4.1.2 | As above, and real `<button>`/`<input>`/`<label>` everywhere |

## 8. RTL and bidi

Builds on UX§9.

- **The walk order belongs to the document**, and the UI's direction belongs to the language. These are two independent axes.
  - The 09-20 regression conflated them.
  - Machine tests vary each axis on its own, and a Playwright fixture covers each combination: an RTL document in the English UI, and an LTR document in the Hebrew UI.
- **∧ ∨ are direction-neutral.**
  - Icons that carry direction mirror in `/he/`, and neutral ones don't.
- **Text growth:** RTL boxes keep a fixed right edge and grow leftward (`registry/text.ts`, `writeDOM`).
- **Comb cells are placed by index** and never reordered by bidi (wysiwyg-text-architecture.md §1.1).
- **A tap-local snap on an RTL page** anchors the box's start edge on the right.

## 9. Performance budgets

| Budget | Target | Measured by |
|---|---|---|
| Pinch | 60fps, transform only | rAF timestamps during a scripted pinch |
| Settle to crisp after a pinch | set in SNG-03 | pointerup to `renderTask.promise` |
| Walk reveal | one motion budget, instant under reduced motion | rAF |
| Time to first page | set in SNG-03, never worse than today | `perf` Playwright project |
| Canvas memory | per canvas under 16.7M px; the total re-measured on iOS 26 [S7] | Simulator |

## 10. Testing

| Layer | Proves | Cannot prove |
|---|---|---|
| The pure machine and router, fed synthetic pointer streams | every MOBI regression as one transition test (P7) | layout, keyboard, real dispatch |
| Vitest DOM | committed state, ARIA, live-region text | real rects, `touch-action`, focus timing |
| Playwright WebKit iPhone project | real WebKit layout and CSS | a synchronous focus raising the keyboard, multi-touch, VoiceOver |
| **iOS Simulator gate** (SNG-07) | the gaps above, except VoiceOver | VoiceOver |

**The Simulator driver:**
- **`safaridriver`** with `safari:useSimulator` [S8]: real WebDriver, JS, DOM and taps.
- **`xcrun simctl io recordVideo`** for evidence.
- **Appium XCUITest in reserve**, only if safaridriver's multi-touch cannot pinch [S9].
- Playwright's WebKit never drives the Simulator [S11]. It stays the earlier, cheaper gate.

**The smoke run.** Each step is asserted from page JS where it can be, and otherwise on video:
- pinch;
- tap to type with the keyboard up;
- next field;
- review;
- tap outside;
- undo a move;
- and, on a scan, tap to write with the snap.

## 11. Review checklist and definition of done

**Every SNG change that touches touch, zoom, focus or the keyboard answers:**
1. Is focus moved synchronously in the gesture handler, on an input that already exists? (For a newly created field, the mechanism is spike (c).)
2. Is every text input's computed font size at least 16px?
3. Is `touch-action` set on the surface and every descendant, without breaking caret placement, selection or the loupe inside the focused input (spike (e))?
4. Is nothing read from `visualViewport.offsetTop`?
5. Is a second contact handled at start, move and release, in the router's event model?
6. Is there no new floating element chrome, and does no Floating UI middleware close over render values?
7. Is any fixed bar verified with the keyboard up?
8. Has it run on the iOS Simulator gate?
9. Is there an RTL-document case, independent of the UI's language?
10. Does every newly committed change have its own undo entry?
11. Does every drag have a non-drag path?
12. Can anything fully cover the focused field?
13. Is reduced motion respected?
14. Are accessible names and roles verified?
15. Does it behave the same where detection found nothing (a scan, a missed field), and does nothing count, name or promise what detection only guessed?

**Done means:**
- all 15 answered in the commit or ticket;
- the Simulator smoke run green, with video;
- every WCAG row it touches re-verified;
- an RTL fixture wherever the walk, focus or the keyboard is touched;
- VoiceOver claims confirmed on a real iPhone;
- the full `ci.yml` chain green;
- any learning written here or in editor.md, not left in a commit body.

## 12. Open decisions (for the owner)

| # | Decision | Recommendation |
|---|---|---|
| 0 | The direction (SNG-02 canvas) | Row F, "Tap to write": B's top bar, built for reasonable detection (§1). C's question cards wait for the model step (SNG-12); A's composer stays spike (c)'s fallback. |
| 1 | Double-tap on the page | Leave it unbound: double-tap already locks a tool, and no competitor zooms on it |
| 2 | Long-press | Leave it unbound until a real need is named |
| 3 | A tap on the page, with nothing selected and no tool armed | Writes there, found spot or not: the one rule (§1). An empty box that loses focus disappears |
| 4 | "Only a selected element moves" | Touch only; the mouse keeps select-and-drag |
| 5 | Previous with nothing selected | Disabled |
| 6 | Checkboxes, dates and signatures in the walk; Next never skips a filled stop | Yes; a signature stop offers "Sign" and never opens the sheet on arrival |
| 7 | Dates | Typed into the printed cells, not the iOS date wheel |
| 8 | Undo feedback (row D) | A chip for a delete; a named Undo for moves, resizes and typing |
| 9 | The non-drag path for move and resize on touch (WCAG 2.5.7) | A move/resize stepper in the selected element's bar controls; decide with the direction |
| 10 | Handle hit areas | 44px, shrinking toward a 24px floor, never overlapping |
| 11 | When the app may move the camera | Only on a walk step, a jump from Review, and entering or leaving Review |
| 12 | Dismissing a false detection | "Not a field" in the bar at that stop; it sticks for the file and feeds `reconcile` |
| 13 | What each bar context holds at 375px (§2.6) | Decide with the direction, and measure in SNG-03 |
| 14 | Saving the walk position in the draft | Yes, re-selected but not focused after a reload |
| 15 | `interactive-widget=resizes-content` on the editor page | Yes. Android honours it and iOS ignores it (WebKit bug 259770) |
| 16 | Counts and field names | Only from a fillable PDF's own fields; never for found spots |
| 17 | The precision floor for a mark, a stop or a highlight | 95% per corpus form, scored as shown (SNG-11) |
| 18 | The keyboard on a found spot | Text, always; digits only when the file says so |
| 19 | A tap that writes below the readable zoom | The camera reveals the new box, like a walk step (§4) |

## 13. Cases the rules must also cover

| Case | Rule |
|---|---|
| **Android Chrome** | The same model and rules. Its `visualViewport` follows the spec, and it supports `interactive-widget=resizes-content`, which keeps a fixed bar above the keyboard by resizing the layout viewport (proposed for the editor page, open #15). The gate gets an Android emulator smoke run beside the iOS one (SNG-07). |
| **Landscape** | Supported. With the keyboard up, the bars compact to one row, the walked field still lands in the visible band, and nothing is forced to rotate. |
| **iPad Split View and Slide Over** | Layout follows width and input follows the pointer. Both change live, so state, selection and an open text session survive a resize. |
| **An external keyboard** (iPad, or a phone with one) | There is no soft keyboard, so `visualViewport` does not shrink. Tab and Shift+Tab walk the fields, and every §2.4 shortcut works. |
| **Drafts and reload mid-walk** | Elements persist as today. The walk position is saved in the draft (proposed, open #14). After a reload the field is re-selected but not focused: iOS allows no keyboard without a tap, so one tap resumes typing. |
| **A pinch during a text session** | Allowed. Editing is a state, not a gesture, so the session and the keyboard stay open, zoom changes around the fingers, and the camera does not move afterwards (§4). |
| **The signature sheet's typed name** | Its input follows every keyboard rule here: at least 16px, focused synchronously on the tap that opens "Type", and the sheet stays above the keyboard. |
| **A form detection reads badly** (HMRC SA100 at 4.3% precision, ภ.ง.ด.90 at 23.5%) | The floor removes the marks (SNG-11), so the page behaves as a scan does: tap to write, lined up, with §1's "We didn't mark anything on this form" line. Nothing apologises. |
| **A stray tap** | It writes a box and raises the keyboard. Tapping away, or Done, closes the empty box and it disappears, with no undo step. |

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
