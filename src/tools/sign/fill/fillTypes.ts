/**
 * Fill mode (SNG-15): the types every fill module shares. This file is the contract
 * between the pieces (docs/sign-fill-mode.md); change it first, then the pieces.
 *
 * The model SNG-14 measured on iOS: every writing spot is a real, focusable input in
 * reading order, so the platform's own next and previous (the arrows above the iOS
 * keyboard, Tab on desktop) do the hopping. An empty spot is a slot, a UI-only input
 * that never enters the editor model. A filled spot is the text element production
 * already renders. A slot becomes an element when it is left with text in it.
 */
import type { TextElement } from '../../../editor/model/editorModel.ts';
import type { PercentBox, TypableField } from '../../../editor/text/combPlacement.ts';

/** A point on a page in page-percent (0-100), top-left origin, like every region. */
export interface PagePoint {
  pageIndex: number;
  x: number;
  y: number;
}

/** Where a slot sits and how its text is laid out, as the text element will be created. */
export interface SlotPlacement {
  /** The input's box on the page, page-percent. */
  box: PercentBox;
  /** Font size in PDF points and the family, resolved the way the element will be. */
  fontSize: number;
  fontFamily: string;
  /** Comb fields only: the cell count, so the slot spaces letters like the element will. */
  combCells?: number;
}

/**
 * An empty writing spot. `field` is the detected field it came from, or null for a free
 * slot that a tap opened where nothing was detected.
 */
export interface FillSlot {
  /** Stable across renders: derived from the field, or the tap point, only. */
  key: string;
  pageIndex: number;
  field: TypableField | null;
  placement: SlotPlacement;
}

/** One entry in a page's fill layer: an empty slot, or a text element already placed. */
export type FillItem =
  | { kind: 'slot'; key: string; slot: FillSlot }
  | { kind: 'text'; key: string; element: TextElement };

/** The keyboard's return key for a fill input: "next" everywhere but the last, "done" there. */
export type EnterKeyHint = 'next' | 'done';

/** Something a tap can reach: a fill item or a detected tick box, by key, with its box. */
export interface ReachTarget {
  key: string;
  pageIndex: number;
  box: PercentBox;
}

/** The armed tool as fill mode sees it; 'other' is everything production handles itself. */
export type FillTool = 'text' | 'mark' | 'other';

/** What a tap on the page does in fill mode. */
export type FillTapDecision =
  /** The tap landed on a fill input: let the browser focus it natively. */
  | { type: 'native' }
  /** Within reach of a fill input: focus it now, inside the touch handler (MOBI-24). */
  | { type: 'focus'; key: string }
  /** Typing, and the tap is away from every spot: finish typing, nothing else. */
  | { type: 'dismiss' }
  /** Text armed, not typing, nothing in reach: open a free slot here. */
  | { type: 'freeSlot'; at: PagePoint }
  /**
   * Everything else: production's own tap path (useWorkspaceGestures handlePageClick).
   * `at` is set when fill mode's reach found a tick box for an armed mark: the tap is
   * passed on at that box's centre, so production's tighter snap lands where the
   * droppable look promised.
   */
  | { type: 'delegate'; at?: PagePoint };

/** DOM contract: every fill input carries both attributes. */
export const FILL_INPUT_ATTR = 'data-fill-input';
export const FILL_KEY_ATTR = 'data-fill-key';

/** The fill key of a placed text element's input. */
export function textFillKey(elementId: string): string {
  return `el:${elementId}`;
}
