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
import type { FieldRegion, PercentBox, TypableField } from '../../../editor/text/combPlacement.ts';
import type { TextDirection, TextElement } from '../../../editor/model/editorModel.ts';
import { detectedSlots, freeSlot, placementForField, placementForFree } from './fillSlots.ts';
import { fillOrder } from './fillOrder.ts';
import { boxKey } from './fillDom.ts';
import { textFillKey } from './fillTypes.ts';
import type { FillItem, FillTool, PagePoint, ReachTarget } from './fillTypes.ts';

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
    return { ...field.region };
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

/**
 * What `documentFillItems` builds a document's fill items from:
 * `PdfWorkspace`'s own state (the detected fields in reading order, the
 * placed text elements, the open free slot) plus what a fresh slot's
 * placement needs - the document's carried typography and each page's size
 * in PDF points.
 */
export interface DocumentFillInput {
  /** orderTypableFields' output: every detected comb and cell, in reading order. */
  order: TypableField[];
  /** Every text element in the document. */
  textElements: TextElement[];
  /** Where a tap opened the one free slot (FillContext.freeAt), or null. */
  freeAt: PagePoint | null;
  /** The document's carried font and size (SIGN-33; size null until the first
   * placement seeds it): slots never follow the selected element's. */
  typography: { fontFamily: string; carriedFontSize: number | null };
  /** A page's size in PDF points. */
  pageSizeOf: (pageIndex: number) => { width: number; height: number };
  directionOfPage: (pageIndex: number) => TextDirection;
}

/**
 * Every fill item in the document, in reading order: each detected field
 * still empty as a slot, the free slot, and every text element.
 */
export function documentFillItems(input: DocumentFillInput): FillItem[] {
  const { order, textElements, freeAt, typography, pageSizeOf, directionOfPage } = input;
  const pageContext = (pageIndex: number) => {
    const size = pageSizeOf(pageIndex);
    return { ...typography, pageWidthPoints: size.width, pageHeightPoints: size.height };
  };
  const slots = detectedSlots(order, textElements, (field) => placementForField(field, pageContext(field.region.pageIndex)));
  const withFree = freeAt
    ? [...slots, freeSlot(freeAt, placementForFree(freeAt, pageContext(freeAt.pageIndex)))]
    : slots;
  const items: FillItem[] = [
    ...withFree.map((slot) => ({ kind: 'slot' as const, key: slot.key, slot })),
    ...textElements.map((element) => ({ kind: 'text' as const, key: textFillKey(element.id), element })),
  ];
  return fillOrder(items, (item) => boxOf(item, order, (pageIndex) => pageSizeOf(pageIndex).height), directionOfPage);
}

/** What a tap or hover can reach for the armed tool (docs/sign-fill-mode.md, "Taps"). */
export function fillReachTargets(
  tool: FillTool,
  items: FillItem[],
  checkboxes: FieldRegion[],
  boxOfItem: (item: FillItem) => PercentBox & { pageIndex: number },
): ReachTarget[] {
  const fillTarget = (item: FillItem): ReachTarget => {
    const { pageIndex, left, top, width, height } = boxOfItem(item);
    return { kind: 'fill', key: item.key, pageIndex, box: { left, top, width, height } };
  };
  switch (tool) {
    case 'text':
      return items.map(fillTarget);
    case 'date':
      return items.filter((item) => item.kind === 'slot' && item.slot.field !== null).map(fillTarget);
    case 'mark':
      return checkboxes.map((region): ReachTarget => ({
        kind: 'box',
        key: boxKey(region),
        pageIndex: region.pageIndex,
        box: { left: region.left, top: region.top, width: region.width, height: region.height },
      }));
    case 'other':
      return [];
  }
}

/**
 * Items grouped by page, each page's list keeping the given order; items on
 * a page at or past `numPages` are dropped.
 */
export function fillItemsByPage(items: FillItem[], numPages: number): FillItem[][] {
  const pages: FillItem[][] = Array.from({ length: numPages }, () => []);
  for (const item of items) {
    const pageIndex = item.kind === 'slot' ? item.slot.pageIndex : item.element.pageIndex;
    if (pageIndex >= 0 && pageIndex < numPages) pages[pageIndex].push(item);
  }
  return pages;
}
