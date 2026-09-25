# Sign, next generation: plan of record

*Opened 2026-09-25.* This is the plan for the next-generation Sign editor, and the record of why it exists. Its tickets are the `SNG-*` epic in `backlog/tasks/`. The normative rules that follow from it (interaction grammar, why there is no field walk, the viewport, accessibility, testing, and the review checklist) are in [sign-next-gen-guidelines.md](./sign-next-gen-guidelines.md).

It comes out of one day of work:
- seven code audits;
- a bisect and two targeted diagnoses;
- a zero-context adversarial review;
- five competitor studies;
- the owner's direction.

**The decision.** Stop patching mobile Sign. Design and build the next-generation editor, starting from three mobile sketches the owner picks from. Desktop moves onto the same architecture.

**Its detection premise (the owner, 2026-09-25, final).** The page is an image and the person is the guide: even perfect detection could not know which blanks are this person's to fill, since that is a judgment about intent and context, an employer's section left blank on purpose, an optional checkbox, a yes/no mark in a medical form, not something the page alone can carry (§5.6). So nothing in the UI comes from whole-page detection; the person chooses what to write, and the app helps only with where, at the fingertip, on every document alike.

## 1. The pains

**Stated by the owner:**
- "The work on mobile became very complex on sign, seems like there are too many race conditions."
- "It is currently not useful on mobile, which is one of the claims of the app."

**Measured.** Over 76 days of activity (2026-07-11 to 2026-09-25):
- 283 commits touched `src/tools/sign`, `src/editor`, `src/editor-ui` and `src/lib/gestures`. About 50 cite a MOBI ticket.
- There are 34 MOBI tickets. Nearly every mobile bug in them was found by the owner on an iPhone after CI was green.

**Fix-on-fix chains:**
- **MOBI-17** took 7 commits in one evening. It was reopened the same day, then split into MOBI-32.
- **MOBI-16 → 19 → 20** took 6 to 8 commits in about five hours.
- **MOBI-27 / MOBI-29** are one handle-spacing defect, fixed and then over-corrected.
- **MOBI-25 and MOBI-26** say that no automated check can confirm their fix on iOS.
- **MOBI-30** shipped without ever being reproduced.

**Regressions open on 2026-09-25.** All three stay unfixed until the new editor ships, by the owner's decision:
1. **The Next arrow jumps to the bottom of the document.**
   - d93aef7e (09-20) made the field arrows follow the document's direction.
   - On a Hebrew form, the right-hand › became *Previous*, and Previous with nothing selected goes to the last field (`fieldOrder.ts:227`).
   - Reproduced on the iOS 26 Simulator.
   - It was a local rule nobody asked for. Every competitor that shows navigation arrows keeps them in UI direction.
2. **A pinch-to-zoom drags or resizes elements.**
   - `controller.ts` cancels a gesture only inside `touchmove` (line 42). `finish()` commits unconditionally (line 59).
   - Suppose finger 1 starts a drag, finger 2 lands, and finger 1 lifts before any `touchmove` has carried both. The drag or resize is committed. This was reproduced in jsdom for both.
   - Until the second finger's first move, the element visibly follows finger 1.
   - 3d231e3a (09-14) gave every resize handle a 44px hit square. On a 4px checkbox, the four squares merge into a pad about 130 times the box's area.
   - The create path (`useWorkspaceGestures.ts:369`) has no multi-touch guard at all.
3. **Undo does not cover an accidental move.**
   - `HistoryOperation` is `'add' | 'delete'`.
   - Moves, resizes, typing and styling all pass through `updateElement` (`PdfWorkspace.tsx:229`), which never logs. This is UNDO-04. Redact has the same gap at `PdfRedactTool.tsx:591`.

## 2. Why it breaks: four causes

Each of these is a pattern, not a bug. Each fix was locally right and created the next edge.

1. **Safari owns zoom, and our chrome lives inside the zoomed page, corrected after the fact.**
   - The corrections:
     - a counter-scale fed by a CSSOM `--vv-scale` publisher;
     - Floating UI pinned to a zoom-invariant `rootBoundary`;
     - a second middleware that re-clamps into `visualViewport`;
     - an iOS-only origin fix;
     - a z-index race with the sticky strip.
   - All of them react to a number the app does not control.
   - Most MOBI tickets live here: 16, 17, 19, 20, 23, 25, 27, 29 and 32.
2. **Nothing owns "what is this touch".**
   - Each listener classifies after the fact, with its own thresholds:
     - 8 raw px on elements;
     - 16 zoom-normalised points on blank space;
     - timers of 400, 500 and 500 ms, from three tickets.
   - About a dozen flags are spread across six files.
   - An element claims a finger at touchstart, before anyone knows whether a second finger is coming.
   - `.element { touch-action: pinch-zoom }` means a swipe that starts on a field never scrolls the page.
3. **Interaction state has no owner.**
   - "Editing" lives in the reducer, in DOM focus and readOnly, and in `activeElement` checks.
   - Gesture-in-progress is three per-hook cancel refs.
   - Timing is arbitrated by module-level singletons, and every popover owns its own boolean.
   - Effects reconcile all of these, and comments hold the ordering together.
   - Cancelling a gesture means snapshotting and restoring a subtree's attributes.
4. **The tests run on the wrong engine.**
   - Every Sign mobile spec runs on Chromium, with CDP touch and CDP pinch.
   - The one WebKit iPhone project in `playwright.config.js` allowlists six specs, and none of them is a Sign spec.
   - The logic that breaks lives in hooks and effects, not in a pure model, so it can only be tested end to end, on the wrong engine.

**What is solid.** The editor core stays: about 11,900 lines, with about 1,300 unit tests.
- It covers the model, geometry, registry, text/fonts/shaping, PDF export and flattening, form detection and drafts.
- It is DOM-free except for `registry/text.ts`'s comb measurement.
- CI enforces the boundary.
- `controller.ts`'s commit-once pattern is sound.
- The percent-based element model already renders at any page width.

## 3. Learnings to keep

These hold for any web editor on iOS. Each was paid for with a shipped bug.

- **iOS raises the keyboard only for a `focus()` made synchronously inside the touch handler.**
  - A focus from a Preact effect runs after paint and gets no keyboard (MOBI-24). Playwright's WebKit does not enforce this rule, so e2e stays green.
  - Any design where "state changes, then focus follows" is wrong on iOS. The focus has to run in the event's call stack, and the input it focuses must already exist.
- **`position: sticky`/`fixed` sticks to the layout viewport.**
  - When the keyboard opens, iOS scrolls the visual viewport, so a sticky top bar rides out of sight (MOBI-06 → MOBI-16).
- **`visualViewport.offsetTop` is wrong with the keyboard up** (WebKit bug 237851, open since iOS 15.4).
  - `pageTop - scrollY` is the value iOS keeps consistent.
- **Safari has ignored `user-scalable=no` and `maximum-scale` for user pinch since iOS 10.**
  - `touch-action` is the only reliable native-zoom blocker.
  - Nutrient's guidance is to set it on every element, not just a wrapper.
- **iOS auto-zooms the page when an input or textarea under 16px gets focus.**
- **JavaScript cannot set Safari's pinch zoom.** Any flow that zooms *to* something (a field, or an overview) needs app-owned zoom.
- **A pdf.js canvas on iOS is capped at about 16.7M pixels**, and there is a total canvas memory budget. High zoom needs visible-pages-only or tiled rendering.
- **Floating UI's `useFloating` compares middleware by `toString()`.** A closure over a changing render value is silently stale.
- **CDP `Input.synthesizePinchGesture` / `setPageScaleFactor` model Chromium, not iOS.** A green Chromium pinch spec proves nothing about Safari.
- **Two fingers never land in the same instant.** Any gesture that commits on release must also check for other fingers on `touchstart` and `touchend`, not only on `touchmove`.
- **Product-visible direction rules need the owner's call.** The arrow swap in d93aef7e was reasoned carefully, and users still read it as a regression.

## 4. Competitors (studied 2026-09-25, headless WebKit as iPhone 15, plus their code and docs)

| | Zoom | Element controls | Field detection | Next field | Review step | File leaves device |
|---|---|---|---|---|---|---|
| Adobe Acrobat online | no phone web editor: touch devices get "Get app" only; a forced upload hits a sign-in wall | n/a | native app only | native app only | none documented | yes |
| Smallpdf | app-owned: +/- %, own pinch handler, canvas pages | fixed top bar, bottom sheets, modals | AcroForm, typed in place | no | no | yes |
| iLovePDF | Safari native, no zoom UI | sticky top bar; a tiny floating duplicate/delete pair | none | no | no | yes |
| PDF24 | app-owned: +/-, fit; `touch-action: none` on its Fabric canvas | one sticky top bar holds every property | none | no | no | yes |
| Sejda | app-owned: +/-; `user-scalable=0`, which iOS ignores | sticky top tool bar, fixed bottom "Apply" bar | AcroForm, inputs as small as 8px tall | no | no | yes |

**Takeaways:**
- **Nobody ships a rich floating per-element toolbar on a phone.** Controls live in fixed bars and sheets.
- **Three of the four web editors own zoom.** The one that leaves zoom to Safari has almost no chrome to protect.
- **None has field-to-field navigation, a progress count or a "what did I miss" review.** On-device processing (all five upload the file) and real RTL are where PDkef leads; the next generation drops the other three from PDkef's own UI too, on the owner's raster-first premise (§5.6).
  - Sejda shows a banner saying right-to-left scripts aren't fully supported.
  - Smallpdf keeps its arrows LTR on a Hebrew form.
- **Signature capture is a modal or sheet with Draw / Type / Upload** (PDF24 and Sejda add Camera).
  - `touch-action: none` is set only on the pad.
  - Nobody forces landscape.
- **Avoid:**
  - inputs sized to PDF geometry (Sejda);
  - a drawer that covers three quarters of the page (iLovePDF);
  - 10px handles (Sejda);
  - a draw pad wider than the screen with desktop copy (Sejda).

The evidence (screenshots, DOM and CSS dumps, bundle greps) was captured in the session scratchpad and is not kept. Re-run the study before quoting any number to the public.

## 5. Principles of the next generation

1. **The app owns the viewport.**
   - Zoom, pan-to-field and the overview are the app's.
   - Safari never zooms the editor: `touch-action: pan-x pan-y` on the surface and every descendant.
   - Scrolling stays native, so momentum is free.
   - During a pinch, a CSS transform on the pages. On release, a re-layout at `fitWidth × zoom` and a pdf.js re-render at the settled scale, with the focal point kept.
2. **Chrome never lives inside the page.**
   - Controls live in one contextual bar.
   - The page carries only a selection outline and handles, sized from the app's own zoom, so they are always physical size.
   - Floating UI, `visualViewportClamp`, `useVisualViewportScale`, the counter-scales and the z-index lifts go away.
3. **One arbiter for input.** A single Pointer Events router classifies each touch sequence once, in screen px, with one set of constants:
   - A second finger always wins, and cancels on `touchstart` as well as on move and release.
   - A touch never moves an element that was not selected before the touch began. A swipe that starts on an unselected element scrolls the page (owner's decision, 2026-09-25).
   - A movement slop comes before an element follows a finger.
4. **One interaction machine, synchronous.**
   - `send(event)` runs the transition and its effects in the caller's stack, including `input.focus()` inside the touch handler. Only then does it notify Preact to re-render.
   - It is not `useReducer` plus `useEffect`, which is exactly the MOBI-24 trap.
   - Views only render.
   - Illegal states are unrepresentable: editing implies selected, and a pinch excludes a drag.
5. **Every committed change is one undo step** (UNDO-04).
   - Moves, resizes, typing (one step per edit session) and styling are all included.
   - No "Moved · Undo" chip (owner's decision); Undo and Redo in the bar are the whole model.
6. **The page is an image, and the person is the guide. The app never claims what the form needs.**
   - **The owner's premise, 2026-09-25, final:** "impeccable ux based on raster with user guidance assuming low precision and recall." It replaces the same day's earlier model, in which found fields were marked, walked, counted and flagged when empty.
   - **Why, beyond the measurements:** even perfect detection could not know which blanks are this person's to fill. An employee's form leaves the employer's section blank on purpose. "Check the following if they apply" makes an unticked box a correct answer. Whether a blank is a gap is a judgment about intent and context, not about the page. So a walk over fields, a count, or "you missed this" is a guess about intent, and a wrong guess frustrates more than it helps.
   - **Marks are as central as text:** a tick or a cross in a box (the yes/no answers of a medical form), a circle around an answer, a line through what does not apply, initials, a signature, a date.
   - **The rules:**
     - Nothing in the UI comes from whole-page detection: no marks on found fields, no walk over fields, no counts, no empty-field review, no field names.
     - The person chooses what to write. The app never guesses the kind of mark.
     - The app helps only with where, at the fingertip: a tick centres in the box under the finger, text sits on the line, a circle wraps the word, a strike runs through it. This help reads only a small window of the rendered page, declines when unsure, and is one undo away (SNG-09, widened to every mark).
     - A scan and a typed PDF behave the same. (Open: whether a fillable PDF's own fields are filled silently underneath.)
     - Guidance teaches how, never what: first-run hints, and, depending on the direction, the app moving the view through the page for the person (open #0, SNG-02).
     - The finish shows what you added, never what you missed.
   - **What detection does today** (measured 2026-09-25: `node scripts/score-form.mjs --all` on d7f8c817, equal to `baselines.json`):
     - Most typed forms, fillable or flat, score 87-100% recall at 96-100% precision: health 86.7/100, form 101 94.2/97.8, 1040 (2024) 100/97.8, I-9 98.1/96.2, ล.ย.01 100/100.
     - Unusual layouts fail badly: ภ.ง.ด.90 52.4/23.5 (dividers inside combs split them), HMRC SA100 26.7/4.3 (one square per digit reads as a checkbox), SSO 1-10 17.4/100 (dotted leaders and glyph checkboxes carry no ink).
     - Our own practice form scores 88.9/88.9.
     - A scan scores 0: no text layer and no vector ink (MOBI-14 has not started). Many forms people fill on a phone are scans.
     - Signature and date lines with no box around them are the most-missed kinds.
     - **Labels are weaker still.** Label association is not measured on today's code (FORM-03). The last measurement was 80.7-81.5% on form 101, under its own 85% gate. Fields read from a fillable PDF's widgets carry no label at all: no code reads `/TU`, although the I-9 has one on all 128 fields (the 1040 has none).
   - **No breakthrough changes that on a phone** (three studies, 2026-09-25):
     - Finding fields has one real advance: CommonForms and its FFDNet detectors (2025, 6-25M parameters, trained on 55k forms). The dataset is CC BY 4.0, but the weights' licence is unresolved, no browser port exists, and it was not trained on phone photos of paper.
     - Knowing which label belongs to which field is unsolved even in English. The one permissively licensed candidate (LiLT, MIT) is English-only and trails the non-commercial models, and no benchmark covers Hebrew forms.
     - On an iPhone, a web page has no built-in model: Chrome's runs on desktop and Android only, and Apple's form detection is native-only.
     - Every product that walks a person through fields, or asks questions, does so over fields a human confirmed: DocuSign's sender, TurboTax's tax code, a fillable PDF's own fields. The largest viewers (Chrome, Drive, Edge) fill only real fields and guess nothing. Adobe's detected boxes that could not be dismissed drew its sharpest complaints. Microsoft's human-AI guidelines say the same: support efficient dismissal (G8) and correction (G9), and scope the service when in doubt (G10).
   - **The model step (SNG-12) stays later,** and would change this only on documents where it is proven.
7. **Tested where it breaks.**
   - The machine and the router are pure, and are unit-tested with synthetic pointer streams. Every MOBI ticket becomes a transition test.
   - The Sign mobile specs run in the WebKit iPhone project.
   - A scripted iOS Simulator smoke run gates every change to the mobile editor.
8. **Files never leave the device.** Unchanged, and now a stated edge over all five competitors.

## 6. Desktop: one editor, adaptive layouts

**Decision (proposed 2026-09-25): desktop moves onto the same architecture.** A phone-only rewrite that leaves desktop on the old one was rejected, for four reasons:

- **Causes 2 and 3 are not mobile-only.**
  - Scattered interaction state and per-listener arbitration live in the shared hooks.
  - Desktop is quieter only because a mouse is one pointer and the page never zooms.
- **The iPad is desktop-wide and touch-driven.**
  - A split by width would put iPad Safari on the desktop path: floating toolbars, native pinch and a touch keyboard. That is the fragile mix at its worst.
  - The split has to be by capability, and one router already handles every pointer.
- **Two editors diverge.**
  - Redact already re-implements Sign's Floating UI wiring (`RedactBox.tsx:72-109` against `DraggableWrapper.tsx:269-351`).
  - A second interaction model would double every future fix.
- **Desktop gains from the same pieces:**
  - app zoom (buttons, Ctrl or Cmd + wheel, fit width);
  - moving between marks (Tab / Shift+Tab, the convention of every PDF form viewer);
  - the finish step;
  - fine-grained undo.

**What desktop looks like on the new surface.** Desktop sketches follow once a mobile sketch is chosen.

- **The contextual bar.** The same component as on the phone, laid out wide in the sticky tool card:
  - With nothing selected: tools, then a Finish button, then zoom (−, %, +, Fit), then Undo/Redo, then Download.
  - With an element selected: its properties replace the tools (size, colour, font, delete, duplicate), the way Canva's bar changes on selection.
- **No floating element toolbar.** Nothing can cover the field above it, the MOBI-32 class is gone on desktop too, and there is one place to look.
- **In-place WYSIWYG typing in the box.** There is no soft keyboard, so desktop never needs the phone's workarounds.
- **Keyboard shortcuts are unchanged.** Tab and Shift+Tab move between marks.
- **Optional on wide screens:** a marks rail listing every mark the person added. It is the finish step, kept open.

**Order of work.** The phone ships first, because that is where the pain is. Desktop follows on the same flag to parity. Then the old paths are deleted, and Redact moves over. Redact first needs its own state consolidated: it has about 13 `useState`s and no reducer.

When the new surface ships, the floating-toolbar rules in `.claude/rules/editor.md` retire with it (above-the-element placement, no vertical flip, the row caps). Until then they stand for the current editor.

## 7. Architecture

| Layer | Where | New or kept |
|---|---|---|
| Model, geometry, registry, text, export, drafts | `src/editor/**` | kept |
| Field detection (one entry point, `detectFormFields`), with SNG-09's tap-local snap as a strategy in it | `src/tools/sign/fields/` (moved in ARCH-24) | kept; the purity guard (FORM-22) and the scoring ratchet (FORM-21) apply |
| History with `'update'` entries, coalescing, labels | `src/editor/model/` | extended (UNDO-04) |
| Interaction machine (pure, synchronous interpreter) | `src/editor/interaction/` | new |
| Input router (Pointer Events to machine events) | `src/editor-ui/` | new; replaces the claim logic in `useDraggableElement`, `useElementResize`, `tapOutsideDeselect` and `PdfWorkspace`'s touch handlers |
| Viewport (app zoom, page layout, render scheduling, reveal-a-field) | `src/editor-ui/` | new; replaces `visualViewportClamp`, `useVisualViewportScale` and field navigation's zoom branch |
| Views: contextual bar, pages, selection overlay, finish | `src/tools/sign/` and `src/editor-ui/` | new, adaptive by width and pointer |

`controller.ts` keeps commit-once. The gesture golden rule is unchanged.

## 8. Plan

| Phase | Ticket | Gate |
|---|---|---|
| 0. Plan of record and learnings (this document) | SNG-01 | done |
| 1. Three mobile sketches; the owner picks one; polish it into a clickable prototype | SNG-02 | the owner picks a direction within the raster-first premise |
| alongside 1. Practice form v2: the sketches' Employee details form becomes the app's own example form | SNG-10 | the owner's choices on its open questions |
| 2. Spike on the iOS 26 Simulator, shaped by the chosen sketch | SNG-03 | go/no-go on every question below, each with a fallback |
| 3. Interaction machine, input router and fine-grained undo, pure, with the MOBI history as tests | SNG-04, UNDO-04 | unit suite green; every MOBI regression has a test |
| 4. Phone surface behind a flag, Simulator release gate | SNG-05, SNG-07 | parity checklist on the Simulator and on the owner's iPhone |
| 5. Desktop on the same surface: sketches first, then parity, then flip the flag and delete the old paths | SNG-06 | parity on desktop and iPad |
| 6. Redact: consolidate its state, then move onto the machine | SNG-08 | Redact's specs green on both engines |
| alongside 3-4. Every mark lands neatly: a local snap at the fingertip for text, ticks, crosses, circles and strikes | SNG-09 | a scored scan corpus, precision over reach |
| later. The model step: a model the person connects reads the form; a document that clears 90/90/85 unlocks asking questions | SNG-12 | the owner reopens it once connecting a model is resolved |

**Spike questions, each with its fallback:**
- **(a)** With `pan-x pan-y` on every descendant, do two-finger touches reach JS reliably while one-finger pans stay native with momentum?
  - Fallback: `touch-action: none` and an app-owned pan.
- **(b)** Does a fixed top bar stay in view with the keyboard up, when the editor fills the screen and the field is revealed in the upper half before focus?
  - Fallback: position the bar from `visualViewport.height` alone.
- **(c)** Does a newly created field's input get the keyboard?
  - Mechanisms: an always-mounted input focused synchronously, then either kept (typing in the bar with a live mirror) or handed to the box's own textarea while the keyboard stays up.
  - Fallback: the always-mounted input remains the editor.
- **(d)** pdf.js memory at 3x zoom and DPR 3.
  - Fallback: render only visible pages, and tile at high zoom.
- **(e)** With `touch-action` on the surface, do caret placement, selection handles and the loupe still work inside the focused input?
  - Fallback: the focused input and its editing box keep `touch-action: manipulation`, and a pinch that starts on them is ignored.
- **(f)** Is Return reliably interceptable in a single-line box on a printed line, on the iOS and Android keyboards, including during IME composition?
  - Fallback: these boxes are single-line `<input>`s, and commit happens on `change` if interception fails.
- **(g)** Which event model does the router use on iOS?
  - Candidates: Pointer Events (and whether a two-finger gesture under `pan-x pan-y` yields `pointercancel`), or Touch Events with `preventDefault`.
  - Fallback: Touch Events for touch, Pointer Events for mouse and pen.

**Superseded MOBI tickets.** These are retired into this plan, because each is a symptom of a cause above: MOBI-20, 23, 25, 26 and 32. MOBI-33 and MOBI-34 (the field-map review, and navigation reading the reviewed map) no longer feed principle 6, which now rules out any review over detected fields; they stay open for the owner's own call.
