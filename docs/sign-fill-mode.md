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
  - A slot left empty leaves nothing behind.
  - A filled field is the text element production already renders (`TextNode` inside
    `DraggableWrapper`), made focusable and writable in fill mode.
  - Nothing hands focus from one input to another mid-typing.
- **Reading order is DOM order.**
  - Each page's overlay has one fill layer holding its slots and its text elements, sorted into reading
    order: page, then row, then the start edge, right to left on an RTL page.
  - Other elements (shapes, signatures, marks) stay in the existing layer, in creation order.
  - iOS's arrows, Tab and VoiceOver all follow the same order.
- **Focus decides what is edited.**
  - When a text element's input gets focus, by an arrow, a tap or Tab, it becomes active and editing
    (`SET_ACTIVE_ELEMENT_ID`, then `SET_EDITING_ELEMENT_ID`).
  - When focus leaves every fill input, editing ends. A text element left empty is deleted.
  - The reducer's invariant (editing is null or equals active) holds throughout.
- **Quiet while typing.** A text element focused through fill mode shows no handles and no element
  toolbar on a touch screen. On a fine pointer, production's element toolbar stays, since a desktop has
  no bar above the keyboard.
- **A page can't add buttons to iOS's bar.** On a touch screen, our toolbar hides while a fill input
  has focus. On desktop it always stays.
- **Taps** (`FillTapDecision`), in this order:
  1. On a fill input: native focus.
  2. Within reach of one: focus it inside the touch handler (MOBI-24). Reach is 22 px, the printed label
     just above a field counts, and between two rows the label's row wins.
  3. Typing, and away from every spot: finish typing only.
  4. Text armed (fill mode treats no tool as Text), not typing, nothing in reach: open a free slot there.
  5. Everything else: production's `handlePageClick`.
- **Hints.** A slot shows a faint frame at rest. The target a tap would reach for the armed tool
  (`FillTool`) gets a distinct "droppable" look while the mouse hovers or a finger is down near it.
  With nothing in reach there is no preview.
- **Keys.**
  - `enterkeyhint` is "next" on every fill input but the last, where it is "done".
  - Enter moves to the next fill input, or on the last one ends typing.
  - Esc ends typing (production's global handler already does this).
- **Off in fill mode:** production's own field navigation (the desktop Tab handler, `.field-nav`,
  `.quick-field-nav`) and fullscreen. Fullscreen makes `.workspace` the scroller, and iOS's arrows can't
  reach an off-screen field inside it.
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
| `fillOrder.ts` | pure | `fillOrder(items, directionOfPage)`, `enterKeyHint(index, count)` |
| `fillSlots.ts` | pure | `detectedSlots(order, textElements, placementFor)`, `freeSlot(at, placement)`, `slotKey(field)` |
| `slotElement.ts` | pure | `elementForSlot(slot, text, defaults)`: the `TextElement` a filled slot becomes |
| `fillReach.ts` | pure | `reachTarget(point, targets, pxPerPercent, options?)` |
| `fillTap.ts` | pure | `fillTapDecision(input)` |
| `FieldSlot.tsx` | component | the slot input: placement style, `enterkeyhint`, Enter, commit on blur |
| `FillLayer.tsx` | component | one page's fill items in order: `FieldSlot`, or a caller-supplied render for text |
| `useFillFocus.ts` | hook | focus-driven editing, and `filling` |
| `fill.module.css` | styles | the slot frame, the droppable look, the toolbar hidden while filling on touch |

Existing files change only at their seams:
- `PdfSignTool.tsx`: the flag, mounting the hooks, and turning off the Tab navigation and fullscreen.
- `PdfWorkspace.tsx`: splits text into `FillLayer`.
- `TextNode.tsx` and `DraggableWrapper.tsx`: a `fill` prop and `quiet`.
- `useWorkspaceGestures.ts`: asks `fillTapDecision` first.
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
