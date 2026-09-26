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
import type { ComponentChildren } from 'preact';
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

/** Something a tap can reach: a fill item (slot or text) or a detected tick box. */
export interface ReachTarget {
  kind: 'fill' | 'box';
  key: string;
  pageIndex: number;
  box: PercentBox;
}

/**
 * The armed tool as fill mode sees it (fillToolOf in fillTap.ts):
 * - 'none': nothing armed. Behaves as 'text' - reaches every fill input, and a tap on
 *   nothing opens a free slot - and also reaches the detected tick boxes, where a tap
 *   runs production's own symbol path (the toggle) rather than opening a text slot.
 * - 'text': Text explicitly armed. Reaches every fill input; a tap on nothing opens a
 *   free slot.
 * - 'date': reaches the empty detected slots only; production places the date at the slot's centre.
 * - 'mark': the symbol tool. Reaches the detected tick boxes; production places it at the box's centre.
 * - 'other': everything else, which production handles itself.
 */
export type FillTool = 'none' | 'text' | 'date' | 'mark' | 'other';

/** What a tap on the page does in fill mode. */
export type FillTapDecision =
  /** The tap landed on a fill input: let the browser focus it natively. */
  | { type: 'native' }
  /**
   * The tap landed on an existing element's own options bar (Delete, colour, font):
   * not fill mode's tap at all. Do nothing - leave the event alone so the bar's own
   * button click fires. Distinct from `native`: `native`'s own touch handling stops a
   * click that follows a touch tap (so it never re-reaches the workspace's blank-area
   * deselect), and that same stop would swallow the bar's own click before it ever
   * reaches the button.
   */
  | { type: 'element' }
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
   * droppable look promised. `tool` is set when nothing is armed and the tap landed on
   * a detected tick box: production's tap path runs as if that tool were armed (always
   * 'symbol' today), so a tap on a printed checkbox toggles it even with nothing armed.
   * `finishTyping` is set when that same box toggle (nothing armed) also has to close a
   * typing session already open elsewhere: without it, the fill input the person was
   * typing in keeps focus while the reducer ends its editing state underneath it.
   */
  | { type: 'delegate'; at?: PagePoint; tool?: 'symbol'; finishTyping?: boolean };

/**
 * What fill mode hands a text element's renderer (TextNode) through TextFillContext.
 * With it, the textarea is a fill input: focusable, writable, hittable, and in order.
 */
export interface TextFillProps {
  fillKey: string;
  enterKeyHint: EnterKeyHint;
  /** Enter, without Shift and not composing: move to the next fill input. */
  onEnter: () => void;
}

/** DOM contract: every fill input carries both attributes. */
export const FILL_INPUT_ATTR = 'data-fill-input';

/**
 * The `autocorrect` value every fill input carries: iOS applies a pending
 * autocorrection as focus hops away, so a name became a word ("Dana" to "Do").
 * WebKit exposes `autocorrect` as a boolean IDL property, and Preact assigns a
 * prop as a property whenever the element has one, so the string "off" is
 * truthy and turns autocorrect ON. It has to be the real boolean `false`;
 * Preact's JSX types only declare a string, hence the one cast, kept here.
 */
export const AUTOCORRECT_OFF = false as unknown as string;
export const FILL_KEY_ATTR = 'data-fill-key';

/** The fill key of a placed text element's input. */
export function textFillKey(elementId: string): string {
  return `el:${elementId}`;
}

/**
 * What PdfWorkspace hands one page's fill layer (FillLayer.tsx). The layer renders
 * `items` in the order given, a FieldSlot for a slot and `renderText` inside a
 * TextFillContext for a text element. It reads the aimed and pending-focus keys, and
 * closeFreeSlot, from FillContext itself.
 */
export interface FillLayerProps {
  /** This page's fill items, already in reading order (fillOrder). */
  items: FillItem[];
  /** The page's width in PDF points, for sizing slot text like the element it becomes. */
  pageWidthPoints: number;
  /** The keyboard hint for an item, from its place in the whole document's order. */
  enterKeyHintOf: (key: string) => EnterKeyHint;
  /** The accessible label every slot reads out (the same one a text box uses). */
  slotLabel: string;
  /** Renders a text element exactly as production does (DraggableWrapper and TextNode). */
  renderText: (element: TextElement) => ComponentChildren;
  onEnter: (key: string) => void;
  onCommitSlot: (slot: FillSlot, text: string) => void;
  /** The element this slot becomes with `text` in it (elementForSlot), for the live comb layout and direction. */
  slotElementOf: (slot: FillSlot, text: string) => TextElement;
}
