import { createElementId } from '../../editor/model/ids.ts';
import { captureAddedElement, type HistoryLogger } from '../../editor/model/actionHistory.ts';
import type { EditorElement, TextDirection, TextElement } from '../../editor/model/editorModel.ts';
import type { PageGeometry } from '../../editor/geometry/coords.ts';
import { getElementDefinition } from '../../editor/registry/index.ts';
import { placeTextOnField } from '../../editor/text/combPlacement.ts';
import {
  elementOnField,
  fieldPosition,
  orderTypableFields,
  type PlacedText,
  type TypableField,
} from '../../editor/text/fieldOrder.ts';
import type { FormFieldRegions } from './useFormFieldRegions.ts';
import { englishSignMessages, formatMessage, type SignMessages } from '../../i18n/toolMessages';
import {
  DEFAULT_COLOR_BLUE,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE_PT,
  PAGE_HEIGHT_DEFAULT_PTS,
  PAGE_WIDTH_DEFAULT_PTS,
} from '../../constants/signGeometry.js';

/**
 * Next/Previous across a page's detected form fields (MOBI-06).
 *
 * `fieldOrder.ts` already knows the fill order and where an element sits in
 * it; this hook is the other half - turning "go forward" into a dispatch
 * sequence. Landing on a field that already has a box just opens it, the same
 * one-tap-to-edit an existing box already gets; landing on an empty one
 * creates it there, sharing `placeTextOnField` with the tap path
 * (`useWorkspaceGestures.ts`) so a field reached by Next looks identical to
 * one reached by tapping it directly - same span, same fitted font size, same
 * RTL/LTR anchoring.
 */

type FieldNavigationAction =
  | { type: 'ADD_ELEMENT'; payload: EditorElement }
  | { type: 'SET_ACTIVE_ELEMENT_ID'; payload: string | null }
  | { type: 'SET_EDITING_ELEMENT_ID'; payload: string | null };

export interface FieldNavigationOptions {
  elements: EditorElement[];
  activeElementId: string | null;
  dispatch: (action: FieldNavigationAction) => void;
  /** Printed grids and free-text cells (MOBI-03/11) plus each page's reading
   * direction (MOBI-06) - the same object PdfWorkspace hands useWorkspaceGestures. */
  formRegions: FormFieldRegions;
  logAction: HistoryLogger<EditorElement>;
  setAnnouncement: (message: string) => void;
  initialColor?: string;
  initialFont?: string;
  initialFontSize?: number;
  pageSizes?: PageGeometry[];
  nextElementIndex?: number;
  /** LOC-16: same optional/English-default shape as useWorkspaceGestures.ts's `messages`. */
  messages?: Partial<SignMessages>;
}

export interface FieldNavigation {
  /** Whether the document has any detected field at all - whether the toolbar
   * shows a Next/Previous control in the first place. Session-durable (it
   * only depends on `formRegions`, not on the current selection), so the
   * control never mounts or unmounts as the person moves between fields -
   * only `hasNext`/`hasPrevious` do that. */
  hasFields: boolean;
  /** Whether Next/Previous has anywhere to go right now - the two buttons'
   * own disabled state. */
  hasNext: boolean;
  hasPrevious: boolean;
  /** Which way the two chevrons point, from the printed direction of the page
   * the navigation is standing on - not the UI locale's. An arrow that points
   * away from where it takes you is wrong in every language, and keying the
   * mirroring on the locale meant a Hebrew form opened on the English edition
   * drew `>` for a step that moved the cursor left (MOBI-06, 2026-09-20). One
   * direction for the whole document, not one per page - see `arrowDirection`
   * for why a per-page answer hides itself.
   *
   * Row wraps are the honest exception: the last field of a row goes to the
   * first of the next, which travels against the arrow in `ltr` and `rtl`
   * alike. These point the way the row reads, not the way every single step
   * moves. */
  direction: TextDirection;
  goToNext: () => void;
  goToPrevious: () => void;
}

/**
 * Which way the two chevrons point, for the whole document at once.
 *
 * Per page would be more faithful to each page - and was the first cut - but
 * the two buttons look identical whichever way they are set: `dir` reverses
 * the flex row and the glyph mirror undoes that, so `<` sits on the left in
 * both directions and only the binding swaps. A page boundary would then
 * change what the button under a finger does with nothing on screen to say
 * so, and tapping the same spot twice across it would walk forward and then
 * straight back. `EditorToolStatus` already refuses to let this control move
 * or unmount underfoot for the same reason. One direction per document keeps
 * the whole benefit on every single-direction form - which is every real one
 * these arrows were built for - and costs only that a minority page inside a
 * mixed document reads its rows against the arrow, consistently and visibly,
 * rather than invisibly.
 *
 * Ties go `ltr`, the way `dominantTextDirection` breaks its own.
 */
function arrowDirection(order: TypableField[], pageDirections: TextDirection[]): TextDirection {
  const rtl = order.filter((field) => (pageDirections[field.region.pageIndex] ?? 'ltr') === 'rtl').length;
  return rtl * 2 > order.length ? 'rtl' : 'ltr';
}

/**
 * The element's position for `fieldPosition`'s fallback ordering, when it is
 * not itself sitting on a field (a signature, a hand-placed box, a line).
 * Every element carries `left`/`top` except a line, which is drawn from its
 * start point instead - close enough for "roughly where on the page is this",
 * which is all the fallback needs.
 */
function positionOf(element: EditorElement): PlacedText {
  const left = 'left' in element ? element.left : element.x1;
  const top = 'top' in element ? element.top : element.y1;
  return { id: element.id, type: element.type, pageIndex: element.pageIndex, left, top };
}

/**
 * Scrolls a just-reached field into view, accounting for the on-screen
 * keyboard where the platform exposes it. `scrollIntoView` measures against
 * the layout viewport, which does not shrink when the keyboard opens - a
 * plain `block: 'center'` can still centre a field behind it. Where
 * `visualViewport` exists, a follow-up nudge re-centres the field inside the
 * space the keyboard has actually left; where it does not (jsdom, older
 * browsers), the plain scroll is the whole answer.
 */
function bringFieldIntoView(elementId: string) {
  if (typeof document === 'undefined') return;
  const node = document.querySelector<HTMLElement>(`[data-editor-element-id="${elementId}"]`);
  if (!node || typeof node.scrollIntoView !== 'function') return;
  node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!viewport) return;
  const rect = node.getBoundingClientRect();
  const visibleTop = viewport.offsetTop;
  const visibleBottom = viewport.offsetTop + viewport.height;
  if (rect.top >= visibleTop && rect.bottom <= visibleBottom) return;
  const target = visibleTop + viewport.height / 2 - rect.height / 2;
  window.scrollBy({ top: rect.top - target, behavior: 'smooth' });
}

export default function useFieldNavigation({
  elements,
  activeElementId,
  dispatch,
  formRegions,
  logAction,
  setAnnouncement,
  initialColor = DEFAULT_COLOR_BLUE,
  initialFont = DEFAULT_FONT_FAMILY,
  initialFontSize = DEFAULT_FONT_SIZE_PT,
  pageSizes = [],
  nextElementIndex = elements.length,
  messages,
}: FieldNavigationOptions): FieldNavigation {
  const t: SignMessages = { ...englishSignMessages, ...messages };

  const order = orderTypableFields(
    formRegions.combs,
    formRegions.cells,
    (pageIndex) => formRegions.pageDirections[pageIndex] ?? 'ltr',
  );

  const activeElement = activeElementId
    ? elements.find((element) => element.id === activeElementId) ?? null
    : null;
  const position = fieldPosition(order, activeElement ? positionOf(activeElement) : null);

  const direction = arrowDirection(order, formRegions.pageDirections);

  /** Opens `field`: selects the box already sitting on it, or creates one. */
  const goTo = (field: TypableField, announcement: string) => {
    const textElements = elements.filter((element): element is TextElement => element.type === 'text');
    const existing = elementOnField(textElements, order, field);
    if (existing) {
      dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: existing.id });
      dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: existing.id });
      setAnnouncement(announcement);
      bringFieldIntoView(existing.id);
      return;
    }

    const definition = getElementDefinition('text');
    if (!definition.creation.create) return;
    const pageGeometry = pageSizes[field.region.pageIndex];
    const pageWidthPoints = pageGeometry?.width || PAGE_WIDTH_DEFAULT_PTS;
    const pageHeightPoints = pageGeometry?.height || PAGE_HEIGHT_DEFAULT_PTS;
    const id = createElementId();
    // Seeded from the FORM's own printed direction, not the product's usual
    // English/LTR default a free placement gets (PdfWorkspace.tsx) - a field
    // reached by Next is sitting on one specific spot on a page whose own
    // text already reads a given way, and getEffectiveTextDirection only
    // honours this seed for a field-spanned box in the first place (see its
    // own doc), so a free box elsewhere is never affected by it.
    const direction = formRegions.pageDirections[field.region.pageIndex] ?? 'ltr';
    const newEl = definition.creation.create({
      id,
      pageIndex: field.region.pageIndex,
      point: { left: field.region.left, top: field.region.top },
      color: initialColor,
      whiteoutColor: '#ffffff',
      strokeWidth: DEFAULT_STROKE_WIDTH,
      font: initialFont,
      fontSize: initialFontSize,
      direction,
    });
    // A comb takes the run's span and cell count; a free-text cell takes its
    // span as `minWidth` - see placeTextOnField's own docstring. Shared with
    // the tap path so a field reached by Next looks exactly like one reached
    // by tapping it (MOBI-04's placement, MOBI-... 's font-fit).
    const snapped = placeTextOnField(field, {
      fontSize: initialFontSize,
      fontFamily: initialFont,
      pageWidthPoints,
      pageHeightPoints,
    });
    const placed = { ...newEl, ...snapped };

    dispatch({ type: 'ADD_ELEMENT', payload: placed });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
    dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: id });
    logAction(
      'add',
      'ADD_TEXT',
      field.region.pageIndex,
      t.addedTextBoxDescription,
      [captureAddedElement(placed, nextElementIndex)],
    );
    setAnnouncement(field.kind === 'comb'
      ? formatMessage(t.addedTextBoxCombAnnouncementTemplate, { cells: field.region.cells })
      : t.addedTextBoxAnnouncement);
    bringFieldIntoView(id);
  };

  return {
    hasFields: order.length > 0,
    hasNext: position.next !== null,
    hasPrevious: position.previous !== null,
    direction,
    goToNext: () => {
      if (position.next === null) return;
      goTo(order[position.next], t.movedToNextFieldAnnouncement);
    },
    goToPrevious: () => {
      if (position.previous === null) return;
      goTo(order[position.previous], t.movedToPreviousFieldAnnouncement);
    },
  };
}
