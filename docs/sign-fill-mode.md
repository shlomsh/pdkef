# Fill mode: the contract (SNG-15)

Fill mode brings the model SNG-14 proved into the production Sign editor, opt-in with `?next=1`. Every
writing spot is a real, focusable input in reading order. The platform's own next and previous do the
hopping: the arrows above the iOS keyboard, the return key's "next", and Tab on desktop. Everything
else is production's own: signature, shapes, colour, thickness, text formatting, date formats, undo,
drafts and export. The types are in `src/tools/sign/fill/fillTypes.ts`. That file and this page are the
contract; change them first, then the pieces.

## The model

- **A slot while empty, an element once filled.**
  - An empty detected field is a slot: a single-line `<input>` that never enters the editor model.
  - When the person leaves a slot with text in it, one `ADD_ELEMENT` creates the text element through
    production's placement (`placeTextOnField`). That is one undo step.
  - A slot left empty leaves nothing behind. The free slot closes whenever it is left (`FieldSlot`'s
    `onLeave`).
  - A filled field is the text element production already renders (`TextNode` inside
    `DraggableWrapper`), made focusable and writable in fill mode.
  - Nothing hands focus from one input to another mid-typing.
- **Reading order is DOM order.**
  - Each page's overlay has one fill layer holding its slots and its text elements, sorted into reading
    order: page, then row, then the start edge, right to left on an RTL page.
  - Other elements (shapes, signatures, marks) render before it, in creation order, so typed text sits
    above a whiteout drawn under it.
  - Slots take the remembered font (`lastFont`, `lastFontSize`), not the selected element's, so empty
    fields never re-layout as focus moves. A commit uses the same values, so nothing jumps.
  - iOS's arrows, Tab and VoiceOver all follow the same order.
- **Focus decides what is edited.**
  - When a text element's input gets focus, by an arrow, a tap or Tab, it becomes active and editing
    (`SET_ACTIVE_ELEMENT_ID`, then `SET_EDITING_ELEMENT_ID`).
  - When focus leaves every fill input, editing ends. A text element left empty is deleted.
  - The reducer's invariant (editing is null or equals active) holds throughout.
- **Native focus, not quiet chrome.** On a touch screen a focused text element shows production's own
  element options bar and resize handles, exactly as production does - parity with production is the
  goal. The only difference fill mode makes is that a tap on its textarea is native focus, with no
  MOBI-21 synchronous-focus dance, and production's own field navigation (the desktop Tab handler,
  `.field-nav`, `.quick-field-nav`) stays off.
- **The main toolbar stays visible while typing, on every pointer.** It no longer hides for a focused
  fill input.
- **Taps** (`FillTapDecision`), in this order:
  1. On a fill input: native focus.
  2. On an existing element's own options bar (`[data-editor-actions]`, Delete, colour, font): its
     buttons always win, before the box-first rule below even runs - otherwise a detected box's own
     reach could swallow a tap meant for the bar of an element sitting near or over it. Resize handles
     (`[data-editor-resizer]`) deliberately stay out of this rule: a real resize is a drag, not a tap.
  3. Within reach of a detected tick box, with the mark tool armed or nothing armed: production's
     `handlePageClick` at the box's centre. On an existing element the box wins only when that
     element is a mark or the tap is inside the box itself (`boxClaims`): production's own rule
     (`useWorkspaceGestures.ts` `handlePageClick`, "a mark covers the very target that toggles it"),
     where a ✓ sits in its box or a selected mark's touch-sized resize handle sits over the next box.
     A signature beside a printed "☐ I agree" keeps its tap. With nothing armed and a typing session open, this also finishes that
     session (`finishTyping`): otherwise the fill input the person was typing in keeps its focus while
     the reducer ends its editing state underneath it.
  4. On an existing editor element (not a fill input or its options bar): production's own path,
     unchanged.
  5. Within reach of the armed tool's target otherwise: Text focuses it inside the touch handler
     (MOBI-24). Date goes to production's `handlePageClick` at the target's centre, so its snap lands
     where the droppable look promised. Reach is 22 px, the printed label just above a field counts,
     and between two rows the label's row wins.
  6. Typing or something selected, and away from every spot: finish that only.
  7. Text armed (fill mode treats no tool as Text), nothing in reach: open a free slot there.
  8. Everything else: production's `handlePageClick`.
  With nothing armed, a tap on a detected tick box toggles it through production's own symbol path,
  even though no tool is armed.
- **What each tool reaches** (`fillReachTargets`): Text (and 'none', which fill mode treats the same
  as Text), every fill input; Date, the empty detected slots; a mark, the detected tick boxes; any
  other tool, nothing. While a tool other than Text is armed, fill inputs don't take taps
  (`taps-go-to-tool`), so the tap reaches that tool.
- **Hints.** A slot shows a faint frame at rest. The target a tap would reach for the armed tool
  (`FillTool`) gets a distinct "droppable" look while the mouse hovers or a finger is down near it.
  With nothing in reach there is no preview.
- **Keys.**
  - `enterkeyhint` is "next" on every fill input but the last, where it is "done".
  - Enter moves to the next fill input and lets the platform scroll it into view (Chrome on iOS has
    no ∧ ∨, so this is its only hop), or on the last one ends typing.
  - Esc ends typing (production's global handler already does this).
- **Off in fill mode:** production's own field navigation (the desktop Tab handler, `.field-nav`,
  `.quick-field-nav`).
- **Zoom stays native in this slice.** The page layout is fit-width with no horizontal overflow, so iOS
  only ever zooms in on a small input. The app-owned camera (a locked scale, layout zoom, framing, a
  canvas re-render) is SNG-16.

## Modules and who owns them

All new files are in `src/tools/sign/fill/`. They are single-consumer, so they live with the tool
(`docs/module-boundaries.md`).

| File | Kind | Owns |
| --- | --- | --- |
| `fillTypes.ts` | types | the contract (lead) |
| `fillMode.ts` | pure | `isFillMode(search)`: `?next=1` |
| `fillOrder.ts` | pure | `fillOrder(items, boxOf, directionOfPage)` over `inReadingOrder` (shared with `orderTypableFields`), `enterKeyHint(index, count)` |
| `fillSlots.ts` | pure | `detectedSlots(order, textElements, placementFor)`, `freeSlot(at, placement)`, `slotKey(field)` |
| `slotElement.ts` | pure | `elementForSlot(slot, text, defaults)`: the `TextElement` a filled slot becomes |
| `fillReach.ts` | pure | `reachTarget(point, targets, pxPerPercent, options?)` |
| `fillTap.ts` | pure | `fillTapDecision(input)`, `fillToolOf(selectedTool)` |
| `fillWorkspace.ts` | pure | `documentFillItems(input)`, `fillReachTargets(tool, items, checkboxes, boxOf)`, `fillItemsByPage`, `boxOf`, `fillItemIndex` |
| `FieldSlot.tsx` | component | the slot input: placement style, `enterkeyhint`, Enter, commit on blur |
| `FillLayer.tsx` | component | one page's fill items in order: `FieldSlot`, or a caller-supplied render for text |
| `FocusProxy.tsx` | component | the hidden input a free-slot tap focuses first |
| `useFillFocus.ts` | hook | focus-driven editing |
| `useFillTap.ts` | hook | the overlay's taps and hover, adapted to `fillTapDecision` and `reachTarget` |
| `fill.module.css` | styles | the slot frame, the droppable look |

Existing files change only at their seams:
- `PdfSignTool.tsx`: the flag, mounting the hooks, and turning off the Tab navigation.
- `PdfWorkspace.tsx`: splits text into `FillLayer`.
- `TextNode.tsx` and `DraggableWrapper.tsx`: read `TextFillContext`.
- `useWorkspaceGestures.ts`: `handlePageClick` takes an optional corrected point.
- `PdfWorkspace.tsx` also: a click on a fill input never deselects, and `deactivateAll` blurs a focused
  slot as it already blurs a textarea.
- `SignToolbar.tsx`: shows Text as chosen when nothing is armed in fill mode.

## Rules for every piece

- Decisions live in pure functions with unit tests and no DOM. Hooks and components adapt them to
  events and elements; they don't decide.
- Reuse production: `orderTypableFields`, `elementIsOnField`, `placeTextOnField`, `startEdge`'s RTL rule,
  the reducer's actions, `TextNode`, `DraggableWrapper`, `FormFieldHints`. Don't re-implement any of
  them.
- Nothing changes when `?next=1` is absent. Every existing test stays green unchanged.
- The gesture golden rule, the fonts invariant and the MOBI-24 synchronous focus all hold.
- No em dashes.

## Seams between the pieces

These are the only places the pieces meet. Each is written down in code: `fillTypes.ts`,
`FillContext.tsx` and `fillDom.ts`.

- **`FillContext`** (`FillContext.tsx`). `PdfSignTool` provides it; the workspace, the gestures and the
  toolbar read it. It holds:
  - the flag and the pointer kind;
  - the aimed key;
  - the one free slot's point (`freeAt`);
  - a pending focus key;
  - the focus proxy's ref.

  Without `?next=1` it is `FILL_OFF`, and every consumer behaves as production does today.
- **The text element's fill props** travel by context, not by renderer prop, so the editor core's
  renderer map learns nothing about fill mode.
  - `FillLayer` wraps each text element in `TextFillContext` (`FillContext.tsx`) with its
    `TextFillProps`. `TextNode` and `DraggableWrapper` read it with `useTextFill()`.
  - With it, the textarea is a fill input:
    - `tabIndex` 0, not read-only, not inert, pointer-events auto;
    - `data-fill-input` and `data-fill-key`;
    - `enterkeyhint`;
    - Enter (no Shift, not composing) calls `onEnter`.
  - Its focus no longer selects: `useFillFocus` does that.
  - `DraggableWrapper` renders its element options bar and `TextNode` its resize handles exactly as
    production does, whether or not `TextFillContext` is set - `.quick-field-nav` stays off in fill
    mode only because `fieldNav` is never supplied there (PdfWorkspace.tsx). The one thing
    `TextFillContext` on a coarse pointer (`useFill().coarse`) still changes is `DraggableWrapper`'s own
    `nativeFocus`: a tap on the textarea is left to native focus instead of MOBI-21's synchronous-focus
    dance, since fill mode's textarea is already focusable and writable.
- **The focus proxy.**
  - The workspace renders one hidden input for `proxyRef`:
    - fixed at the top left, one pixel, fully transparent, `tabIndex` -1, `aria-hidden`;
    - font size 16 px, so iOS never zooms for it.
  - A tap that opens a free slot:
    1. focuses the proxy inside the touch handler, which raises the keyboard (MOBI-24);
    2. opens the slot and sets the pending focus key.
  - The fill layer focuses that key's input once it renders, with the keyboard already up, and clears
    the key. This also closes MOBI-26's gap for fill mode.
- **The DOM adapter** (`fillDom.ts`):
  - `focusFillInput(key)` and `focusNextFillInput(fromKey)`: DOM order is reading order;
  - `boxKey(region)` for tick-box reach targets.
- **Gestures.** In fill mode the overlay's handlers go through `useFillTap`, which asks
  `fillTapDecision`. Touch decides on `touchend`. A `delegate` with a resolved point (e.g. a detected
  tick box's centre) runs right there at `touchend` and calls `preventDefault`, with no
  `stopPropagation`: the touch may have started on an existing editor element whose own `touchstart`
  handler (`DraggableWrapper`) already preventDefaulted to own a drag, which kills iOS's synthesized
  click, so waiting for it would mean the tap never runs - and the window still has to see this
  `touchend`, since the gesture controller (`src/lib/gestures/controller.ts`) finishes that same drag
  there. Production's own `handlePageClick` mirrors this: it skips its own `stopPropagation` on an
  event whose `type` is `'touchend'`, for the same reason, and `PdfWorkspace`'s blank-area deselect
  skips a `touchend` that is already `defaultPrevented`, so the mark it just placed stays selected.
  Only a box's or a Date field's centre is a resolved point; every other production tap is a plain
  `delegate`. Native and a plain `delegate` wait for the click iOS synthesizes afterward, and that
  click never decides again. The mouse
  reads "typing" at `mousedown`, before the default blur. The decisions:
  - `native`: leave the event alone;
  - `element`: the tap landed on an existing element's own options bar, not fill mode's tap at all -
    leave the event alone, so the bar's own button click fires. Distinct from `native`: `native`'s own
    handling of the click that follows a touch tap calls `stopPropagation`, which would swallow the
    bar's click before it ever reached the button;
  - `focus`: `focusFillInput(key)` synchronously;
  - `dismiss`: blur;
  - `freeSlot`: the proxy dance above. `openFreeSlot(at)` opens the slot and sets the pending focus
    key to its key, so the gesture only focuses the proxy and calls it;
  - `delegate`: production's `handlePageClick`, at the corrected point when one is given. A
    `finishTyping` delegate (nothing armed, a box toggle while typing) calls `dismiss()` first, so the
    fill input does not keep focus once the reducer ends its editing state.
- **The armed tool, as `FillTool`** (`fillToolOf`): no tool is `'none'` (fill mode treats it like Text:
  every fill input, and a tap on nothing opens a free slot - plus the detected tick boxes, where a tap
  runs production's own symbol toggle), Text is `'text'`, Date is `'date'`, the symbol tool is `'mark'`,
  anything else is `'other'`.
- **The aim.** A mouse hovering with no button down (pointer events, so iOS's synthesized mouse events
  never count), or a finger down, sets the aimed key from `reachTarget`. It clears when the touch ends
  or is cancelled, and when the pointer leaves the page.
- **The toolbar.** With no tool armed, `SignToolbar` shows Text as chosen in fill mode. It stays
  visible while filling, on every pointer.
