/**
 * Fill mode (SNG-15): the pure helpers `PdfWorkspace.tsx` builds a document's
 * fill layers with. Nothing here touches the DOM or Preact - see
 * docs/sign-fill-mode.md, "Rules for every piece" ("decisions live in pure
 * functions with unit tests and no DOM").
 */
import {
  DEFAULT_FALLBACK_ELEMENT_WIDTH_PCT,
  DEFAULT_FONT_SIZE_PT,
  TEXT_BOX_LINE_HEIGHT_EM,
} from '../../../constants/signGeometry.js';
import { elementIsOnField } from '../../../editor/text/fieldOrder.ts';
import type { PercentBox, TypableField } from '../../../editor/text/combPlacement.ts';
import type { FillItem } from './fillTypes.ts';

/**
 * A fill item's box in page percent, for `fillOrder.ts`'s reading-order sort
 * (`PdfWorkspace` calls this as the `boxOf` that sort runs on, once per
 * page).
 *
 * A slot's box is its own placement - the very box its `<input>` renders at
 * (fillSlots.ts). A text element already sitting on a detected field
 * (`elementIsOnField`, the same test Next/Previous resolves a move onto in
 * `fieldOrder.ts`) takes that field's own region, so a filled field reads in
 * exactly the position its slot did rather than wherever the element's own
 * geometry happens to be. Every other text element - hand-placed, or on no
 * field at all - has no field to borrow a box from, so it gets one built
 * from its own geometry: `left`/`top` are already page percent, the width is
 * whichever of `minWidth`/`width` it carries (a cell's minimum or a comb's
 * span), falling back to the same small default an ordinary box with
 * neither renders at, and the height is one line at its own font size, in
 * the same percent-of-page-height terms `useWorkspaceGestures.ts`'s
 * `handlePageClick` sizes a freshly placed box with (`textHeight`).
 */
export function boxOf(
  item: FillItem,
  order: TypableField[],
  pageHeightPointsOf: (pageIndex: number) => number,
): PercentBox & { pageIndex: number } {
  if (item.kind === 'slot') {
    return { ...item.slot.placement.box, pageIndex: item.slot.pageIndex };
  }
  const { element } = item;
  const field = order.find((candidate) => elementIsOnField(element, candidate));
  if (field) {
    return { ...field.region, pageIndex: field.region.pageIndex };
  }
  const heightPoints = pageHeightPointsOf(element.pageIndex);
  const fontSize = element.fontSize ?? DEFAULT_FONT_SIZE_PT;
  const height = heightPoints > 0 ? (fontSize * TEXT_BOX_LINE_HEIGHT_EM / heightPoints) * 100 : 0;
  return {
    left: element.left,
    top: element.top,
    width: element.minWidth ?? element.width ?? DEFAULT_FALLBACK_ELEMENT_WIDTH_PCT,
    height,
    pageIndex: element.pageIndex,
  };
}

/**
 * Where `key` sits among `items`, or -1 when it is not there at all (a stale
 * key from an item that just unmounted). `PdfWorkspace`'s `enterKeyHintOf`
 * composes this, over every page's items flattened into one document-wide
 * list, with `fillOrder.ts`'s own `enterKeyHint` - kept separate so each half
 * has one job, and a test can pin the lookup without also pinning "next" vs
 * "done".
 */
export function fillItemIndex(items: FillItem[], key: string): number {
  return items.findIndex((item) => item.key === key);
}
