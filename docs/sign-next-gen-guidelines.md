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

Open a form on a phone. Zoom to where you want to write, choose what to write, and tap. A tick lands in its box, text sits on its line, and nothing on the page is guessed for you. Sign it, look over what you added, and share it. The page never jumps, no control covers what you are filling, nothing moves unless you meant it, and every change can be undone. The file never leaves the phone.

## 1. The page is an image, and the person is the guide

**The owner's premise, 2026-09-25, final:** "impeccable ux based on raster with user guidance assuming low precision and recall" (`docs/sign-next-gen.md` §5.6). It replaces the same day's earlier model, in which found fields were marked, walked, counted and flagged when empty.

**Why, beyond the measurements:** even perfect detection could not know which blanks are this person's to fill. An employee's form leaves the employer's section blank on purpose. "Check the following if they apply" makes an unticked box a correct answer. Whether a blank is a gap is a judgment about intent and context, not about the page. So a walk over fields, a count, or "you missed this" is a guess about intent, and a wrong guess frustrates more than it helps.

**Marks are as central as text:** text, a tick, a cross, a circle, a strike, initials, a signature, a date.

**Rules:**
- Nothing in the UI comes from whole-page detection: no marks on found fields, no walk over fields, no counts, no empty-field review, no field names.
- The person chooses what to write. The app never guesses the kind of mark.
- The app helps only with where, at the fingertip: a tick centres in the box under the finger, text sits on the line, a circle wraps the word, a strike runs through it. This help reads only a small window of the rendered page, declines when unsure, and is one undo away (SNG-09, widened to every mark).
- A scan and a typed PDF behave the same. (Open: whether a fillable PDF's own fields are filled silently underneath.)
- Guidance teaches how, never what: first-run hints, and, depending on the direction, the app moving the view through the page for the person (open #0, SNG-02).
- The finish shows what you added, never what you missed.

**Copy never says** "missed", "empty", "N fields" or "all done". The finish says "Here's everything you added."

**The first-open hint** is decided with the direction (SNG-02); proposed: "Zoom in, choose what to write, and tap where it goes."

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
| finish | the zoomed-out look at what you added; a tap on one of your marks opens it |

**Illegal, and unrepresentable in the machine (P4):**
- editing without that element selected;
- a tool armed while an element is selected: selecting disarms, and arming clears the selection;
- two gestures at once;
- any gesture or armed tool while the signature sheet or finish is open.

### 2.2 Touch (phone and iPad)

| Input | Outcome |
|---|---|
| Tap, the page, idle | Places the chosen mark (Text when nothing else is chosen), helped to its spot at the fingertip (§1). How a mark is chosen is the direction pick (open #0). |
| Tap, the page, something selected or editing | Deselect: one level per tap, as Escape. A box left empty closes and disappears, with no undo step. |
| Tap, the page, a tool armed | As today: the tool places its mark and disarms, unless a double-tap locked it (SIGN-30/31). Whether ticks and crosses stay armed by default is open (#21). |
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
| Click | Blank page: with something selected, deselect; otherwise place the chosen mark, as a tap does (proposed, open #3; SNG-06 confirms it on desktop). Element: select. Second click of a double-click on text: edit. Second click on a tool: lock. |
| Drag | Any element: select and move in one gesture (desktop convention; the touch-only rule is scoped to coarse pointers, open #4). A handle resizes. |
| Wheel | Native scroll. |
| Ctrl/Cmd + wheel | App zoom in steps, around the pointer; browser zoom is prevented inside the surface. |

### 2.4 Keyboard

| Input | Outcome |
|---|---|
| Tab / Shift+Tab | Moves between the person's own marks in reading order (proposed; `PdfSignTool.tsx` keydown). Otherwise native tab order. |
| Return, in a single-line box on a printed line | Commits and closes the box (proposed). The interception is separate (proposed, spike (f)): these boxes are a single-line `<input>`; Return is a `keydown` Enter that is not `isComposing`; and a `beforeinput` guard catches `insertLineBreak`/`insertParagraph`. |
| Return, in a box on open space | New line. |
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

One contextual bar holds the tools (text and the marks), zoom, Undo/Redo and Download. That is more than today's twelve-control toolbar, which `editor.md` ("Main toolbar layout") shows is already at the edge of a 375px screen.

The rules:
- Each context shows at most what fits one row of 44px targets at 375px. Undo is always in it.
- Everything else goes to a "More" sheet.
- The content of each context is decided with the chosen direction (SNG-02), and measured at 320, 375 and 430px in SNG-03 before any build (open #13).

## 3. No field walk

The walk over detected fields is retired with the premise, and with it regression 1 (Next jumping to the bottom of the document) disappears.

If the direction moves the view through the page for the person (open #0, A: piece by piece), ∨ goes to the next piece of the page in document order, never to a field. The order rules carry over:
- **Order** is a document property and never depends on the UI's language:
  - rows cluster by top edge (`ROW_TOLERANCE_PERCENT`, `fieldOrder.ts:41`);
  - within a row, it starts at the page's printed start edge (`fieldOrder.ts:47-51`);
  - pages go in ascending order.

**Keyboard.** The text keyboard, always; digits are reached through its 123 key, never a guessed number pad. Dates are typed like any other text.

## 4. The viewport and the reveal

**Zoom** is app-owned (P1):
- The range runs from the whole page, through fit width (the resting zoom), to a max that the iOS canvas cap allows (SNG-03 (d); 3x is the working ceiling).
- **Pinch:** a CSS transform during the gesture with the midpoint fixed under the fingers. On release, one re-layout and one pdf.js re-render at the settled scale, with the focal point unmoved. Never re-centre: a view that moves on its own loses the person (MOBI-22, MOBI-25).
- **Zoom buttons** (−, %, +, Fit) are the single-pointer path (WCAG 2.5.1). They live in the bar (§2.6).

**Who moves the camera.** The app moves or zooms the view only on:
- entering or leaving the finish;
- a step to the next piece, if the direction has pieces (open #0, A);
- a tap that writes at a zoom where the text would render under 17px (open #19). This is also how a person at fit width sees at once which line the box landed on.

Any other tap opens what it touches where it is, at the zoom the person chose. The person's own zoom wins everywhere else (proposed, open #11).

**The reveal:**
- A box being typed in lands in the upper third of the visible band, below the bar and clear of the keyboard, so its printed label above it stays in view.
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

## 5. The finish: what you added

- **Every page, zoomed out,** with the person's own marks highlighted. A tap on one opens it to fix; nothing is filled from the overview itself.
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

**Must, and testable:**
- **Focus order is DOM order:** the bar, then the page, then the person's marks in reading order.
- **One polite live region** announces placements, undo and the finish (for example "Tick added, page 1"). Numbers inside RTL copy are isolated (`<bdi>`, UX§9).
- **Every mark has an accessible name** from its kind and page ("Tick, page 1"); a text mark also reads its text. Never blank, never an id.
- **Contrast.** Every mark state (placed, selected, being typed in) and the finish's highlight reach 3:1 against the page (WCAG 1.4.11).
  - **Blocked by QUAL-04:** `--color-border-strong` (`#6fbeb2`) is 2.07:1, so no mark, highlight or piece outline may use it as its only boundary.

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

- **The reading order belongs to the document**, and the UI's direction belongs to the language. These are two independent axes.
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
| Reveal | one motion budget, instant under reduced motion | rAF |
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
- placing a tick and a signature;
- finish;
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
15. Does it behave the same on a scan and a typed PDF, and does nothing claim what the form needs (a gap, a count, a next field)?

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
| 0 | The direction (SNG-02): how a page about 2.5 times wider than the phone is read and filled. A, piece by piece: the app cuts each page into readable pieces where the white space is, and ∨ moves through them in reading order ("3 of 8" counts pieces, not fields). B, whole page and close-up: a tap zooms into an area, Done zooms back out. C, never zoom: a magnifier to aim, a large box above the keyboard to type | Pending. Recommended: A, with B's tap on the whole page to jump into a piece |
| 1 | Double-tap on the page | Leave it unbound: double-tap already locks a tool, and no competitor zooms on it |
| 2 | Long-press | Leave it unbound until a real need is named |
| 3 | What a tap on the page places | The chosen mark, Text by default |
| 4 | "Only a selected element moves" | Touch only; the mouse keeps select-and-drag |
| 5 | Previous at the first piece | Applies only if the direction has pieces (A) |
| 6 | Checkboxes, dates and signatures in the walk; Next never skips a filled stop | Retired with the field walk |
| 7 | Dates | Typed into the printed cells, not the iOS date wheel |
| 8 | Undo feedback (row D) | A chip for a delete; a named Undo for moves, resizes and typing |
| 9 | The non-drag path for move and resize on touch (WCAG 2.5.7) | A move/resize stepper in the selected element's bar controls; decide with the direction |
| 10 | Handle hit areas | 44px, shrinking toward a 24px floor, never overlapping |
| 11 | When the app may move the camera | Only on entering or leaving the finish, a step to the next piece if the direction has pieces, and a tap that writes below the readable zoom (§4) |
| 12 | Dismissing a false detection | Retired: no detection marks to dismiss |
| 13 | What each bar context holds at 375px (§2.6) | Decide with the direction, and measure in SNG-03 |
| 14 | Saving the current piece in the draft, if the direction has pieces | Yes, re-selected but not focused after a reload |
| 15 | `interactive-widget=resizes-content` on the editor page | Yes. Android honours it and iOS ignores it (WebKit bug 259770) |
| 16 | Counts and field names | No counts or field names anywhere |
| 17 | The precision floor for a mark, a stop or a highlight | Retired: no whole-page detection in the UI |
| 18 | The keyboard when writing text | The text keyboard always |
| 19 | A tap that writes below the readable zoom | The camera reveals the new box, like a walk step (§4) |
| 20 | Fillable PDFs: fill their own fields silently underneath, or treat them as images too | Open |
| 21 | Whether a tick or a cross stays armed after a tap by default, instead of today's one-shot with a double-tap to lock | Open |

## 13. Cases the rules must also cover

| Case | Rule |
|---|---|
| **Android Chrome** | The same model and rules. Its `visualViewport` follows the spec, and it supports `interactive-widget=resizes-content`, which keeps a fixed bar above the keyboard by resizing the layout viewport (proposed for the editor page, open #15). The gate gets an Android emulator smoke run beside the iOS one (SNG-07). |
| **Landscape** | Supported. With the keyboard up, the bars compact to one row, the box being typed in still lands in the visible band, and nothing is forced to rotate. |
| **iPad Split View and Slide Over** | Layout follows width and input follows the pointer. Both change live, so state, selection and an open text session survive a resize. |
| **An external keyboard** (iPad, or a phone with one) | There is no soft keyboard, so `visualViewport` does not shrink. Tab and Shift+Tab move between the person's own marks, and every §2.4 shortcut works. |
| **Drafts and reload** | Elements persist as today. The current piece, if the direction has pieces, is saved in the draft (proposed, open #14). Nothing else is auto-focused after a reload: iOS allows no keyboard without a tap, so one tap resumes typing. |
| **A pinch during a text session** | Allowed. Editing is a state, not a gesture, so the session and the keyboard stay open, zoom changes around the fingers, and the camera does not move afterwards (§4). |
| **The signature sheet's typed name** | Its input follows every keyboard rule here: at least 16px, focused synchronously on the tap that opens "Type", and the sheet stays above the keyboard. |
| **A stray tap** | It places the chosen mark; an empty text box disappears when you tap away, and any other mark is one undo away. |
| **Yes/no rows (medical forms)** | A tick locked by a double-tap (as today) makes a column of ticks one tap each (open #21); nothing guesses which box is yours. |
| **"Check the following if they apply"** | Nothing flags an unticked box. |
| **A section for someone else (the employer)** | Nothing flags it; the finish only shows what you added. |
| **"Delete whichever does not apply"** | The strike pen runs a line through the word under the finger, centred on the text by the local help (SNG-09). |

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
