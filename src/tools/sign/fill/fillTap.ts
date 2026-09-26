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

/**
 * What a tap on the page does in fill mode, in the order docs/sign-fill-mode.md fixes:
 * a real input always wins, then the armed tool's own reach (Text and None focus what
 * they reach; Date and a mark are placed by production at its centre; None on a tick box
 * runs production's own toggle, as if the mark tool were armed), then closing a typing
 * session, then opening a free slot for Text or None, and only then production's own tap
 * path. The order is the behaviour, so it stays a short list of guard clauses rather
 * than a lookup table.
 */
export function fillTapDecision(input: FillTapInput): FillTapDecision {
  const { onFillInput, typing, tool, reach, at } = input;
  if (onFillInput) return { type: 'native' };
  if ((tool === 'text' || tool === 'none') && reach?.kind === 'fill') return { type: 'focus', key: reach.key };
  if (tool === 'date' && reach?.kind === 'fill') return { type: 'delegate', at: centreOf(reach) };
  if (tool === 'mark' && reach?.kind === 'box') return { type: 'delegate', at: centreOf(reach) };
  // Nothing armed, and the tap reached a detected tick box: run production's own
  // checkbox toggle (handlePageClick) as if the symbol tool were armed.
  if (tool === 'none' && reach?.kind === 'box') return { type: 'delegate', at: centreOf(reach), tool: 'symbol' };
  if (typing) return { type: 'dismiss' };
  if ((tool === 'text' || tool === 'none') && at) return { type: 'freeSlot', at };
  return at ? { type: 'delegate', at } : { type: 'delegate' };
}
