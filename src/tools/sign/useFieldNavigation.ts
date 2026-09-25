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
import { visibleViewportOrigin } from '../../editor-ui/hooks/visualViewportClamp.ts';
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
  /** Whether the document has any detected field at all. Necessary for the
   * toolbar to show a Next/Previous control, and no longer sufficient - it
   * also asks whether anyone is filling fields right now (SignToolbar.tsx's
   * `fillingFields`). Session-durable in itself: it depends only on
   * `formRegions`, never on the current selection, so it cannot make the
   * control blink as the person moves from one field to the next. Only
   * `hasNext`/`hasPrevious` change across a move. */
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
 * Scrolls a just-reached field into view, centred in the space the on-screen
 * keyboard actually leaves (the visual viewport), inside whatever is actually
 * scrolling - the page, or the workspace in full screen.
 *
 * Proven by `src/tools/sign/e2e/field-move-scroll.spec.js`, which samples the
 * scroll offset across a press: one monotonic move, arriving centred. Read that
 * spec's module doc before chasing an "instant jump" in a trace of your own - a
 * Playwright `locator.click()` scrolls its target into view first, instantly,
 * and that driver-side scroll was mistaken for an app-side one for a whole round
 * of MOBI-22.
 */

// One pending field move at a time. Next pressed during the previous move's
// smooth scroll used to leave two deferred scrolls queued, each measured at a
// different moment; the older one is simply abandoned now.
let pendingFrame = 0;
// The tap path's pending reveal (`revealFieldAfterKeyboard` below); a field
// move supersedes it.
let cancelPendingReveal = () => {};

function bringFieldIntoView(elementId: string) {
  // Deferred to after paint, and that is load-bearing. Every caller runs this
  // in the same tick as the dispatch that selects or creates the box, so on the
  // create path the node does not exist in the DOM yet and a synchronous
  // `querySelector` returned null - the move silently did no scrolling at all,
  // and what actually brought the field into view was the browser's own scroll
  // on focus. Two frames: the first lets Preact commit, the second lets layout
  // settle so the rect measured is the one the person will see.
  cancelPendingReveal();
  if (typeof requestAnimationFrame !== 'function') {
    scrollFieldIntoView(elementId);
    return;
  }
  if (pendingFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(pendingFrame);
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      scrollFieldIntoView(elementId);
    });
  });
}

/**
 * The element that actually scrolls the field, or null when it is the page.
 *
 * In full screen it is `.workspace` (`overflow-y: auto`, Workspace.module.css),
 * and on an iPhone full screen is ALWAYS that: Safari has no element
 * `requestFullscreen`, so PdfSignTool falls back to pseudo-fullscreen. A
 * `window` scroll there moves nothing at all - which, with `focus()` no longer
 * allowed to scroll, would have left Next landing on a field off screen.
 */
function scrollContainerOf(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

/** Breathing room a field needs inside the visible band to count as in view. */
const FIELD_VIEW_MARGIN_PX = 8;

function scrollFieldIntoView(elementId: string) {
  if (typeof document === 'undefined') return;
  const node = document.querySelector<HTMLElement>(`[data-editor-element-id="${elementId}"]`);
  if (!node) return;
  const viewport = typeof window !== 'undefined' ? window.visualViewport : null;

  // No visualViewport (jsdom, older browsers): there is nothing better to know,
  // so the plain centred scroll is the whole answer - and `scrollIntoView`
  // scrolls every scrolling ancestor, full screen included.
  if (!viewport || typeof window.scrollTo !== 'function') {
    if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // ONE scroll, measured once, to an ABSOLUTE target. It used to be an
  // asynchronous smooth `scrollIntoView` followed by a nudge computed from a rect
  // read before that scroll had moved anything, which no-opped or double-counted;
  // measured at a phone viewport with the keyboard's shrunken visual viewport,
  // the field landed at y=461 in a band ending at 400 - behind the keyboard - and
  // iOS then scrolled again by itself. Absolute rather than relative (`scrollTo`,
  // not `scrollBy`) because whether a relative smooth scroll adds to the current
  // offset or to one still in flight differs by engine, and a second Next during
  // the first move's glide is exactly when that matters.
  //
  // The band is the visual viewport, clipped to the scrolling container when
  // there is one: `block: 'center'` centres on the layout viewport, which iOS
  // does not shrink when the keyboard opens.
  const rect = node.getBoundingClientRect();
  // The band's top is `visibleViewportOrigin`, not `offsetTop`: with the
  // keyboard up iOS reports an `offsetTop` that is not where the visible slice
  // is in this rect's frame (see that function's header).
  const bandOrigin = visibleViewportOrigin(viewport);
  if (!Number.isFinite(rect.top) || !Number.isFinite(bandOrigin.top) || !Number.isFinite(window.scrollY)) return;

  // MOBI-25: pinch-zoomed, the arithmetic below is not safe to trust. It mixes
  // layout-viewport rects with the visual viewport's offset and hands the sum to
  // window.scrollTo, and iOS resolves that differently once the page is scaled:
  // a Next on a zoomed-in iPhone, with the keyboard up and the next field already
  // on screen, threw the page all the way to its top (reported in production
  // 2026-09-22). The browser's own reveal knows both viewports and both axes, and
  // `nearest` only moves as far as it must.
  if (viewport.scale > 1.01) {
    if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    return;
  }

  const container = scrollContainerOf(node);
  let bandTop = bandOrigin.top;
  let bandBottom = bandOrigin.top + viewport.height;
  if (container) {
    const box = container.getBoundingClientRect();
    bandTop = Math.max(bandTop, box.top);
    bandBottom = Math.min(bandBottom, box.bottom);
  }
  // MOBI-25: a field already in full view stays where it is. It compares a
  // layout-viewport rect with the visual viewport's band, which only agree
  // unzoomed - so it must stay below the zoom branch above. Moving to the
  // neighbour you can see should be a hop, not a page movement - centring every
  // move made even the box beside this one scroll.
  if (rect.top >= bandTop + FIELD_VIEW_MARGIN_PX && rect.bottom <= bandBottom - FIELD_VIEW_MARGIN_PX) return;
  const target = bandTop + (bandBottom - bandTop) / 2 - rect.height / 2;
  const delta = rect.top - target;
  // Sub-pixel deltas are not worth an animation the browser rounds to nothing,
  // and firing one on every move is what makes a walk feel busy.
  if (Math.abs(delta) < 1) return;
  if (container) container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' });
  else window.scrollTo({ top: window.scrollY + delta, behavior: 'smooth' });
}

/**
 * Brings a box the person just tapped open back above the keyboard.
 *
 * A tap opens the edit session with `focus({ preventScroll: true })`
 * (DraggableWrapper.tsx's `beginEditFromTap`), which is what keeps iOS from
 * auto-zooming onto small text - but it also stops iOS from lifting the box
 * clear of the keyboard, and nothing else did. Measured on an iPhone 17
 * simulator, form 101 restored from a draft at scroll 0: tapping a box at a
 * rect top of 586 raised a keyboard that left a visible slice 377 tall, the
 * box stayed underneath it, and the element toolbar (which follows its box)
 * was clamped to the bottom edge of the slice, attached to nothing.
 *
 * The box is on screen when tapped; it is the keyboard that hides it, and the
 * keyboard's height is only known once `visualViewport` resizes for it. So
 * the reveal waits for that resize, then makes the same one deliberate move a
 * field move makes - which leaves a box already in view exactly where it is.
 * The timeout covers a keyboard that was already up (tapping a second box),
 * where no resize comes.
 *
 * One pending move at a time, shared with `bringFieldIntoView`: whichever came
 * last wins. A Next pressed before the keyboard settled must not be followed
 * by a scroll back to the box it left, and vice versa. For the same reason the reveal
 * only runs if that box still holds the focus - a session closed in the
 * meantime has nothing left to reveal.
 */
const KEYBOARD_SETTLE_TIMEOUT_MS = 800;

export function revealFieldAfterKeyboard(elementId: string) {
  cancelPendingReveal();
  // And the other way round: a tap landing during a field move's two frames
  // is the newer intent, so that move is dropped too.
  if (pendingFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(pendingFrame);
  pendingFrame = 0;
  const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!viewport) return;
  const cancel = () => {
    viewport.removeEventListener('resize', reveal);
    window.clearTimeout(timer);
    cancelPendingReveal = () => {};
  };
  const reveal = () => {
    cancel();
    const node = document.querySelector(`[data-editor-element-id="${elementId}"]`);
    if (node && node.contains(document.activeElement)) scrollFieldIntoView(elementId);
  };
  viewport.addEventListener('resize', reveal);
  const timer = window.setTimeout(reveal, KEYBOARD_SETTLE_TIMEOUT_MS);
  cancelPendingReveal = cancel;
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
    // Signature cells are excluded here, not upstream in `formRegions.cells`
    // (see `useFormFieldRegions.ts`'s own doc on that field): Next/Previous
    // opens or creates a typed text box on whatever it lands on, and a
    // signature is placed through the saved-signature dialog, never by
    // typing - the same reason `useWorkspaceGestures.ts`'s tap path excludes
    // it from its own snap.
    formRegions.cells.filter((cell) => cell.kind !== 'signature'),
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
