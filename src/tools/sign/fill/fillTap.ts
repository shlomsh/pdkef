/**
 * Fill mode (SNG-15): what a tap on the page does (docs/sign-fill-mode.md, "Taps").
 *
 * A tap can't simply run `handlePageClick` the way production always has: a real input
 * must keep its native focus behaviour, an armed tool's own reach (`fillReach.ts`) has
 * to win before production's placement does, and a typing session in progress has to be
 * closeable by a tap that does nothing else. `fillTapDecision` is the single place that
 * order is decided, so every caller - the touch handler and the mouse path alike - sees
 * the same precedence.
 */
import type { SignToolType } from '../../../editor/model/editorModel.ts';
import type { FillTapDecision, FillTool, PagePoint, ReachTarget } from './fillTypes.ts';

/** The armed tool as fill mode sees it (fillTypes.ts, FillTool). No tool is 'none'. */
export function fillToolOf(selectedTool: SignToolType | null): FillTool {
  if (selectedTool === null) return 'none';
  if (selectedTool === 'text') return 'text';
  if (selectedTool === 'date') return 'date';
  if (selectedTool === 'symbol') return 'mark';
  return 'other';
}

export interface FillTapInput {
  /** The tap landed on an existing fill input: let the browser focus it natively. */
  onFillInput: boolean;
  /**
   * The tap landed on an existing editor element's own options bar
   * (`[data-editor-actions]`, inside `[data-editor-element]`, see `DraggableWrapper.tsx`):
   * Delete, colour, font and the rest of that bar. Its buttons always win, checked before
   * the box-first rule below even runs - otherwise a detected box's own reach (which
   * fires ahead of `onElement`, see that rule's own comment) would swallow a tap on the
   * bar of an element sitting near or over a box. Resize handles (`[data-editor-resizer]`)
   * deliberately stay out of this: a real resize is a drag, not a tap, and a selected
   * mark's 44px handle overlapping the next box is the bug the box-first rule fixed.
   */
  onElementBar: boolean;
  /**
   * The tap landed inside an existing editor element's own DOM (e.g. a placed mark's
   * resize handle), but not on a fill input. Production owns it, unless a detected box
   * claims the tap first (see `fillTapDecision`'s box-before-element rule).
   */
  onElement: boolean;
  /** The tap landed on an existing mark (`[data-editor-symbol]`, e.g. a placed ✓). */
  onMark: boolean;
  /** A text session is open somewhere on the page. */
  typing: boolean;
  tool: FillTool;
  /** What `fillReach.ts` found near the tap, if anything. */
  reach: ReachTarget | null;
  /** The tap's own page point, or null when it did not land on a page. */
  at: PagePoint | null;
}

/** The centre of a reach target's box, as a tap point on the same page. */
function centreOf(target: ReachTarget): PagePoint {
  return {
    pageIndex: target.pageIndex,
    x: target.box.left + target.box.width / 2,
    y: target.box.top + target.box.height / 2,
  };
}

/** Whether a page point falls inside a box, both in the same page-percent space. */
function pointInBox(at: PagePoint, target: ReachTarget): boolean {
  const { box } = target;
  return (
    at.pageIndex === target.pageIndex &&
    at.x >= box.left &&
    at.x <= box.left + box.width &&
    at.y >= box.top &&
    at.y <= box.top + box.height
  );
}

/**
 * A box in reach claims a tap that landed on an existing element only for the cases the
 * box-first rule exists for: the element is a mark (a ✓ in its own box, or a selected
 * mark's resize handle over the next box), or the tap is inside the box itself. A tap on
 * a signature beside a printed "☐ I agree" stays the signature's.
 */
function boxClaims(input: FillTapInput, target: ReachTarget): boolean {
  return !input.onElement || input.onMark || (input.at !== null && pointInBox(input.at, target));
}

/**
 * What a tap on the page does in fill mode, in the order docs/sign-fill-mode.md fixes:
 * a real input always wins; then the element's own bar; then a detected box in reach
 * (`boxClaims`, production's rule "a mark covers the very target that toggles it"); then
 * a tap on an existing editor element, production's own path; then the rest of the armed
 * tool's reach (Text and None focus a fill field, Date is placed by production at its
 * centre); then closing a typing session; then a free slot for Text or None; and only then
 * production's plain tap path. The order is the behaviour, so it stays a short list of
 * guard clauses rather than a lookup table.
 */
export function fillTapDecision(input: FillTapInput): FillTapDecision {
  const { onFillInput, onElementBar, onElement, typing, tool, reach, at } = input;
  if (onFillInput) return { type: 'native' };
  // The element's own options bar always wins - Delete, colour, font - even when a
  // detected box in reach would otherwise claim the tap first (see below). Not fill
  // mode's tap: do nothing at all, so the bar's own button click runs untouched.
  if (onElementBar) return { type: 'element' };
  // With nothing armed, a box tapped while a typing session is open must also end that
  // session (finishTyping): otherwise the fill input keeps focus while the reducer ends
  // editing underneath it. Mark armed is a deliberate tool switch already, so it doesn't.
  const box = reach?.kind === 'box' && boxClaims(input, reach) ? reach : null;
  if (tool === 'none' && box) {
    return { type: 'delegate', at: centreOf(box), tool: 'symbol', ...(typing ? { finishTyping: true } : {}) };
  }
  if (tool === 'mark' && box) return { type: 'delegate', at: centreOf(box) };
  if (onElement) return { type: 'delegate' };
  if ((tool === 'text' || tool === 'none') && reach?.kind === 'fill') return { type: 'focus', key: reach.key };
  if (tool === 'date' && reach?.kind === 'fill') return { type: 'delegate', at: centreOf(reach) };
  if (typing) return { type: 'dismiss' };
  if ((tool === 'text' || tool === 'none') && at) return { type: 'freeSlot', at };
  return { type: 'delegate' };
}
