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

Open a form on a phone. Walk its fields one at a time, or tap anywhere to write. Sign it, look over the whole page, and share it. The page never jumps, no control covers what you are filling, nothing moves unless you meant it, and every change can be undone. The file never leaves the phone.

## 1. Documents, detection and honesty

Recall will never reach 100% (P6). There is one editor, and three document classes:

| Document | What we know | Walk | Review |
|---|---|---|---|
| Fillable PDF (AcroForm) | every field | exact | "N empty" is exact |
| Vector flat form | detected fields | walks what was found, as suggestions | counts only what was found, and says so |
| Scan, or 0 fields found | nothing | none | every page zoomed out, to check yourself |

Rules:
- **Tap to write is the primary path on every document.**
  - On a scan, the tapped box snaps to the printed line or box under the finger, found locally (SNG-09).
  - The snap declines rather than guesses. When nothing credible is found, the box lands exactly at the tap.
- **A field detection missed becomes a field** the moment a box is placed on it, and it joins the walk in reading order (`fieldPosition`'s reading-order fallback, `fieldOrder.ts:236-246`).
- **A false detection can be dismissed** from the walk and from review (proposed).
- **Copy never claims completeness.**
  - Review ends with "All the fields we found are filled. Check each page for anything we missed."
  - Never "All done", and never "0 of 0".
- **With 0 fields found, say why and what to do:** "We couldn't find fields on this page. It may be a scan. Tap where you want to write."
- **The FORM-09 question flow stays gated** on the 90/90/85 detection bar.

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
| review | The zoomed-out check; a tap on a highlighted field returns to the walk there. |

**Illegal, and unrepresentable in the machine (P4):**
- editing without that element selected;
- a tool armed while an element is selected: selecting disarms, and arming clears the selection;
- two gestures at once;
- any gesture or armed tool while the signature sheet or review is open.

### 2.2 Touch (phone and iPad)

| Input | Outcome |
|---|---|
| Tap, blank page | Idle: nothing. Selected or editing: deselect. Armed: place at the point (on a scan, snapped per §1) and disarm unless locked. |
| Tap, empty detected field | Create a box on the field and open it, in one tap, armed or not (proposed, open #3). |
| Tap, unselected element | Select it. A text element also opens for editing in the same tap (MOBI-21). |
| Tap, the selected element | Text re-opens editing. Anything else is acted on through the bar. |
| One-finger drag, blank page or an **unselected** element | Native scroll. The element ignores the touch (owner, 2026-09-25). |
| One-finger drag, the selected element | Move, after the slop (§2.5), clamped to the page, RTL-aware. |
| One-finger drag, a handle | Resize. |
| A second finger, at any moment | Cancels any pending or live one-finger claim, and restores the DOM. It is checked on `touchstart`, `touchmove` **and** `touchend` (regression 2, sign-next-gen.md §1). The two fingers then pinch. |
| Two-finger pinch or pan | App-owned zoom around the midpoint (§4). |
| Double-tap, page | Unbound (open #1). |
| Double-tap, a tool | Locks it (`toolArming.js`, SIGN-30/31). |
| Long-press | Unbound (open #2). |

### 2.3 Mouse

| Input | Outcome |
|---|---|
| Click | Blank: deselect. Element: select. Second click of a double-click on text: edit. Second click on a tool: lock. |
| Drag | Any element: select and move in one gesture (desktop convention; the touch-only rule is scoped to coarse pointers, open #4). A handle resizes. |
| Wheel | Native scroll. |
| Ctrl/Cmd + wheel | App zoom in steps, around the pointer; browser zoom is prevented inside the surface. |

### 2.4 Keyboard

| Input | Outcome |
|---|---|
| Tab / Shift+Tab | Walk Next/Previous while a field or element is selected (`PdfSignTool.tsx` keydown). Otherwise native tab order. |
| Return, in a walked field | Commit and go to the next field (`enterkeyhint="next"`, `"done"` on the last). |
| Return, in a free-placed text box | New line. |
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

## 3. The field walk

- **Stops.** Every detected kind is a stop:
  - comb/cell and text fields open for typing;
  - a checkbox toggles, with no keyboard (MOBI-05);
  - a date opens for typing into its printed cells;
  - a signature field opens the signature sheet.
  - Today's walk skips checkboxes and signatures (`fieldOrder.ts:16-19`). The next generation includes them (proposed, open #6).
- **Order** is a document property and never depends on the UI's language:
  - rows cluster by top edge (`ROW_TOLERANCE_PERCENT`, `fieldOrder.ts:41`);
  - within a row, the walk starts at the page's printed start edge (`fieldOrder.ts:47-51`);
  - pages go in ascending order.
- **Arrows are ∧ ∨:** up is Previous, down is Next, everywhere. `arrowDirection`'s document vote (`useFieldNavigation.ts:92-113`) retires with the left/right chevrons.
- **Next never skips a filled field**, so field 7 never depends on the path taken. The count reads "2 of 12". Review alone lists what is empty.
- **The boundaries.** Every press has one obvious destination:

| State | Next | Previous |
|---|---|---|
| nothing selected | field 1 | **disabled** (this fixes regression 1 by design) |
| first field | field 2 | disabled |
| last field | Review | field N-1 |
| in Review | not offered | the last field |
| a free-placed box selected | the nearest field after it | the nearest field before it |
| after a deletion | selection clears; "nothing selected" applies | the same |
| during a gesture | inert (the machine refuses the event) | inert |

- **The keyboard per field:**
  - `inputmode` is `numeric` for ID, comb and postal code, `decimal` for amounts, `tel` for phone, `email` for email, and `text` otherwise.
  - Dates are typed into the printed cells, not picked in iOS's date wheel (proposed, open #7). One model for every comb, and the digit order stays a fact of the document.

## 4. The viewport and the reveal

**Zoom** is app-owned (P1):
- The range runs from the whole page, through fit width (the resting zoom), to a max that the iOS canvas cap allows (SNG-03 (d); 3x is the working ceiling).
- **Pinch:** a CSS transform during the gesture with the midpoint fixed under the fingers. On release, one re-layout and one pdf.js re-render at the settled scale, with the focal point unmoved. Never re-centre (UX§16).
- **Zoom buttons** (−, %, +, Fit) are the single-pointer path (WCAG 2.5.1). They live in the bar, beside the walk and Review.

**Who moves the camera.** The app moves or zooms the view only on:
- a Next/Previous step;
- a jump from Review;
- entering or leaving Review.

A plain tap on a field opens it where it is, at the zoom the person chose. The person's own zoom wins everywhere else (proposed, open #11).

**The reveal:**
- The walked field lands in the upper third of the visible band, below the bar and clear of the keyboard, so its printed label above it stays in view.
- It is zoomed so the typed text is at least 17px physical, and comb cells are at least 28px wide.
- **Reduced motion** lands directly, with no transition.

**The iOS order of operations is fixed** (sign-next-gen.md §3):
1. Select or create the field, and focus an input that already exists, synchronously inside the tap.
2. Only then reveal, on the next frame.
3. One pending reveal at a time: a later move cancels an earlier one (`useFieldNavigation.ts:141-147`).
4. A keyboard that is still opening re-runs the reveal once, on the `visualViewport` resize (`revealFieldAfterKeyboard`, `useFieldNavigation.ts:287-308`).

**Rendering:**
- A transform during a gesture, never a re-render mid-gesture.
- Visible pages only in canvas memory, and tiles above a zoom threshold.
- `PdfPageCanvas.tsx` renders at a fixed `scale: 1.5` with no device-pixel-ratio factor today. At `1.5 × zoom × DPR 3`, one US Letter page reaches the iOS 16.7M-pixel canvas cap at about 1.3x past today's render, so visible-pages-only rendering is load-bearing.

## 5. The review

- **Empty** means a detected field with nothing on it.
- **How it looks:**
  - a citron highlight on the field;
  - a tag with the field's label: its canonical type once FORM-02 lands, the detected kind until then;
  - a count ("2 empty"). It is never marked with colour alone (WCAG 3.3.1).
- **Jumping back:**
  - One tap returns to the walk at that field, with §4's reveal and synchronous focus.
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
- **One polite live region** announces "Field 2 of 12, ID number", undo, and review counts. Numbers inside RTL copy are isolated (`<bdi>`, UX§9).
- **Every field and element has an accessible name:** the detected label, or "Text field N". Never blank, and never an id.
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
1. Is focus moved synchronously in the gesture handler, on an input that already exists?
2. Is every text input's computed font size at least 16px?
3. Is `touch-action` set on the surface and every descendant?
4. Is nothing read from `visualViewport.offsetTop`?
5. Are second fingers handled on `touchstart` and `touchend`, not only on move?
6. Is there no new floating element chrome, and does no Floating UI middleware close over render values?
7. Is any fixed bar verified with the keyboard up?
8. Has it run on the iOS Simulator gate?
9. Is there an RTL-document case, independent of the UI's language?
10. Does every newly committed change have its own undo entry?
11. Does every drag have a non-drag path?
12. Can anything fully cover the focused field?
13. Is reduced motion respected?
14. Are accessible names and roles verified?
15. Does it work on a scan with 0 fields found, and does no copy claim completeness?

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
| 0 | Direction A, B or C (SNG-02 canvas) | Pending. See the canvas and row E (scans). |
| 1 | Double-tap on the page | Leave it unbound: double-tap already locks a tool, and no competitor zooms on it |
| 2 | Long-press | Leave it unbound until a real need is named |
| 3 | A tap on an empty detected field, with no tool armed | Creates and opens it, in one tap |
| 4 | "Only a selected element moves" | Touch only; the mouse keeps select-and-drag |
| 5 | Previous with nothing selected | Disabled |
| 6 | Checkboxes, dates and signatures in the walk; Next never skips a filled field | Yes |
| 7 | Dates | Typed into the printed cells, not the iOS date wheel |
| 8 | Undo feedback (row D) | A chip for a delete; a named Undo for moves, resizes and typing |
| 9 | The non-drag path for move and resize on touch (WCAG 2.5.7) | A move/resize stepper in the selected element's bar controls; decide with the direction |
| 10 | Handle hit areas | 44px, shrinking toward a 24px floor, never overlapping |
| 11 | When the app may move the camera | Only on a walk step, a jump from Review, and entering or leaving Review |
| 12 | Dismissing a false detection | Yes, from the walk and from review |

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
