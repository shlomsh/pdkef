/**
 * Fill mode (SNG-15): the frame a field slot draws at rest, before it holds
 * text (docs/sign-fill-mode.md).
 *
 * A field slot's `<input>` is doing two jobs at once and they pull in
 * opposite directions. Its BOX is the visible frame, and that has to be the
 * whole detected field, because that is the promise a slot makes ("write
 * here") - a frame shorter than the printed field, or one that starts lower
 * than the field's own top edge, reads as wrong the moment a person compares
 * it against the page underneath. Its PADDING places the text line inside
 * that box, and that has to land exactly where `textElementLayout`
 * (signHelpers.js) puts the committed element's own line, because a slot's
 * other promise (FieldSlot.tsx's own docstring) is that filling it in causes
 * no visible jump. `commit dd16d642` solved the second job by shrinking the
 * box to the padded line itself, which silently broke the first: a field
 * taller than one line, or whose top sits below the field's own top edge,
 * left the frame short of the printed area (Shlomi, practice form).
 *
 * The fix is to stop asking one box to be both things and let the box and
 * the padding each do their own job. The frame (this function's `top`/
 * `height`) is the union of the printed field and the element's own full
 * padded line box, so a line taller than the field still fits inside the
 * frame instead of the frame clipping it. The padding is then derived, not
 * chosen: `paddingTopPx`/`paddingBottomPx` are whatever is left between the
 * frame's edges and the text line once the frame is fixed, so the line still
 * lands exactly where the committed element's line will.
 *
 * WebKit centres an `<input>`'s value vertically in its own content box, not
 * against its `line-height`, so the content box (the box minus its padding)
 * has to equal the line itself for the typed text to land there - not just
 * the padding value FieldSlot.tsx used to reuse from `layout.font.paddingEm`
 * on an unrelated box.
 *
 * Everything here is page pixels, in the caller's own already-scaled units
 * (`fontSizePx` is `layout.font.fontSize`, already multiplied by the page's
 * scale factor); `pageHeightPx` converts every percent in and out. Nothing
 * here reads DOM, state or the editor model - callers do that measurement
 * and pass the numbers in.
 */

/** A rectangle's vertical extent in page percent (0-100), top-left origin. */
export interface VerticalPercentBox {
  top: number;
  height: number;
}

/** What a field slot's frame needs of the detected field: only its vertical extent
 * matters here, since left/width are unaffected and stay the caller's own box. */
export type FieldVerticalBox = VerticalPercentBox;

export interface SlotFrameInput {
  /** The printed area (`region.writable ?? region`), page percent. Only `top`/`height`
   * are read; left/width stay whatever the caller already has. */
  field: FieldVerticalBox;
  /** The text element this slot would become right now (`elementOf(value)`); only its
   * page-percent `top` matters here. */
  element: { top: number };
  /** The element's font size in CSS px, already scaled (`layout.font.fontSize`). */
  fontSizePx: number;
  /** The element's padding, in em of its own font size (`layout.font.paddingEm`). */
  padEm: number;
  /** The line-height every text box shares (EditorElement.module.css's `.text-display`),
   * in em of the font size. */
  lineHeightEm?: number;
  /** The page's own rendered height in CSS px, for converting every percent above. */
  pageHeightPx: number;
}

export interface SlotFrame {
  /** The frame's top, page percent. */
  top: number;
  /** The frame's height, page percent. */
  height: number;
  /** The input's `padding-top`, in CSS px, so its content box is exactly the text line. */
  paddingTopPx: number;
  /** The input's `padding-bottom`, in CSS px, so its content box is exactly the text line. */
  paddingBottomPx: number;
}

const DEFAULT_LINE_HEIGHT_EM = 1.05;

/**
 * The field slot's frame: the union of the printed field and the element's own full
 * padded box, plus the padding that keeps the text line exactly where the committed
 * element's line will be. See the module doc comment for why the box and the padding
 * are computed separately rather than one calc() doing both jobs.
 */
export function slotFrame({
  field,
  element,
  fontSizePx,
  padEm,
  lineHeightEm = DEFAULT_LINE_HEIGHT_EM,
  pageHeightPx,
}: SlotFrameInput): SlotFrame {
  const fieldTopPx = (field.top / 100) * pageHeightPx;
  const fieldBottomPx = fieldTopPx + (field.height / 100) * pageHeightPx;

  const padPx = padEm * fontSizePx;
  const lineHeightPx = lineHeightEm * fontSizePx;
  // The element's own top edge, and the padded box `textElementLayout` gives it: the
  // line sits `padPx` below that top edge, exactly as `.text-display`'s CSS padding
  // places it on the committed element.
  const elementTopPx = (element.top / 100) * pageHeightPx;
  const lineTopPx = elementTopPx + padPx;
  const lineBottomPx = lineTopPx + lineHeightPx;
  const elementBottomPx = lineBottomPx + padPx;

  // The union: wide enough for the printed field and for the element's full box, so
  // whichever is taller decides that edge.
  const frameTopPx = Math.min(fieldTopPx, elementTopPx);
  const frameBottomPx = Math.max(fieldBottomPx, elementBottomPx);

  // What's left between the frame's edges and the line itself, once the frame is
  // fixed - never negative, because the frame's edges are already at or beyond the
  // line's own padded edges by construction of the union above.
  const paddingTopPx = lineTopPx - frameTopPx;
  const paddingBottomPx = frameBottomPx - lineBottomPx;

  return {
    top: (frameTopPx / pageHeightPx) * 100,
    height: ((frameBottomPx - frameTopPx) / pageHeightPx) * 100,
    paddingTopPx,
    paddingBottomPx,
  };
}
