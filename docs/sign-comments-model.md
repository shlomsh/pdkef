# Sign comments: a comment is its own element, parallel to highlights

*Draft 2026-10-31, for Shlomi's review. Supersedes the "comment is a field of a highlight" model of
SIGN-44.* Shlomi: in Google Docs a comment and a highlight are parallel. You can comment on any
selection without highlighting it, and highlight without commenting. Word works the same way. We follow
that pattern on screen and still write standard PDF annotations.

## The model

- **A highlight is formatting only**: color, bands, direction. No `comment` field.
- **A comment is its own element** (`type: 'comment'`) with a `text`, a `commentedAt` (saved as `/M`,
  never shown) and one **anchor**:
  - `passage`: bands of page text, laid by the same swipe reader as a highlight, with a direction.
  - `element`: the id of another element (a highlight, text box, signature, whiteout, shape).
  - `point`: a spot on the page (the note pin from option B).
- Being an element, it gets draft persistence, undo, per-page lists and delete for free. A `passage` or
  `point` comment stores its own geometry; an `element` comment reads its place from its target at render.
- **Deleting an element deletes the comments anchored to it**, in the same undo step. Copying an element
  does not copy its comments.

## Making a comment

- **A Comment tool** in the main toolbar, beside Highlight. Armed, a swipe across text anchors a comment to
  that passage; a tap on the page drops a pin. The card opens focused in the rail (or the sheet on a
  phone). One-shot like every tool; a double press locks it for several comments in a row.
- **Comment on a selected element**: every element's floating toolbar has the Comment button (today only
  highlights have it). It anchors the comment to that element.
- So commenting on a highlighted passage has two natural routes, both fine: the highlight's Comment button
  (anchor = the highlight) or the Comment tool over the same words (anchor = the passage).

## On screen

- The rail, cards, header count and sheet stay as built: cards list a page's comments in their anchors'
  reading order, the rail opens with the first comment.
- A `passage` anchor shows a light comment tint (its own token, distinct from every highlight color) and
  the dot at its end; an `element` anchor shows the dot at the element's reading-end corner; a `point`
  shows a pin. Selecting a card focuses its anchor (a deeper tint, or the element's outline).

## In the PDF (export and read-back)

| On screen | Exported as | Read back as |
| --- | --- | --- |
| Comment on a highlight | the highlight's own `/Highlight`, comment in `/Contents` (today's export) | highlight + comment anchored to it |
| Comment on a passage | `/Highlight` in the comment tint with `/Contents`, not printed (no Print flag) | passage comment |
| Comment on another element | `/Text` (sticky note) at the element's reading-end corner | pin, or the element's comment when one sits on it |
| Pin | `/Text` at the point | pin |

The comments page at the end and "Print my comments" list every comment, whatever its anchor.

## Saved work already in production

Highlights with a `comment` are live. On load, a pure migration splits each into the highlight plus a
comment element anchored to it, keeping `commentedAt`. Tested both ways with a fixture of today's draft.

## Decisions for Shlomi

1. A Comment tool in the main toolbar (swipe = passage, tap = pin), plus the Comment button on every
   element. *Recommended.*
2. Deleting an element deletes its comments, one undo step. *Recommended* over keeping orphans.
3. A passage comment's tint shows in viewers but does not print. *Recommended*: it is a review mark,
   not content.

## Build contract (2026-10-31)

Shlomi approved the three decisions above. The pieces below are built in parallel against this contract.

### Model (`src/editor/model/editorModel.ts`)

```ts
export interface HighlightBand { left: number; top: number; width: number; height: number } // now exported
export type CommentAnchor =
  | { kind: 'passage'; bands: HighlightBand[]; direction?: 'ltr' | 'rtl' } // bands in % of the element box, like a highlight
  | { kind: 'element'; elementId: string }
  | { kind: 'point' };
export interface CommentElement extends ElementBase, BoxGeometry {
  type: 'comment';
  comment: string;      // '' only while a new card is open; never saved blank
  commentedAt?: number; // epoch ms of the last saved edit, exported as /M, never shown
  anchor: CommentAnchor;
}
```

- Box geometry: a passage comment's box is its bands' union; a pin's box is a small square at the
  tapped point; an element comment's stored box is a snapshot, always replaced by its target's box
  through `resolveCommentBoxes` before rendering, numbering and export.
- `HighlightElement.comment` / `commentedAt` stay in the type until the last step removes them; nothing
  new reads or writes them.

### Shared helpers (`src/tools/sign/lib/comments/anchors.ts`, pure)

- `isComment(el): el is CommentElement`
- `commentsAnchoredTo(elements, id): CommentElement[]`
- `deletedWith(id): (el) => boolean`: true for `id` and for comments anchored to it (the snapshot
  predicate every delete call site uses, so one undo restores both).
- `resolveCommentBoxes(elements): EditorElement[]`: element comments take their target's box and page;
  a comment whose target is gone is dropped.

### Behaviour

- Reducer `DELETE_ELEMENT` also removes comments anchored to the deleted id.
- Draft load (`migrateDraftRecord`, idempotent at every version, `DRAFT_SCHEMA_VERSION` 3): a highlight
  with a non-blank `comment` becomes the highlight plus a comment element `id = <highlight id>-comment`,
  anchor `element`, same page and box, same `commentedAt`, placed right after it; the highlight loses the
  two fields. History: `comment`/`commentedAt` keys leave update entries (an emptied entry is dropped),
  highlight snapshots lose them. A blank comment element is dropped on load.
- Comment actions the views call (wired in the workspace):
  - `onSave(id, patch: { comment: string; commentedAt: number })`: a new comment (stored `comment === ''`)
    records one `add` history entry with the saved element; an existing one records an update.
  - `onDelete(id)`: delete with history (the toolbar delete path).
  - `onDiscard(id)`: Cancel on a new card; removes it with no history.
- Creating: the Comment tool (swipe across text = passage, a press that moves under 4 CSS px = pin, a
  swipe that finds no text = pin at the press) and the Comment button on every selected element's
  toolbar (anchor = that element; if it already has a comment, the button selects that comment). Both
  add the element with `comment: ''`, no history, and make it the active element so its card opens.
- Numbers: `commentNumbers(elements)` keys comment element ids, after `resolveCommentBoxes`, ordered by
  page, then box top, then box left.
- Tint: `--color-comment-anchor` in `global.css`; the PDF side uses its own literal in the registry.
- Export: a comment anchored to a highlight goes into that highlight's `/Highlight` (`/Contents`, `/M`,
  `/Popup`, number badge); a passage comment is its own `/Highlight` in the tint without the Print flag;
  a pin or a comment on any other element is a `/Text` note at the box's reading-end top corner,
  without the Print flag. Every comment keeps its numbered `/FreeText` badge and its comments-page entry.
