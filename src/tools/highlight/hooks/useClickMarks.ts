import { useEffect, useRef } from 'preact/hooks';
import type { ElementAction } from '#editor-ui/elementActions.ts';
import { captureAddedElement, type HistoryLogger } from '#editor/model/actionHistory.ts';
import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import type { ElementsAction } from '#editor/model/elementsReducer.ts';
import { createElementId } from '#editor/model/ids.ts';
import type { PageGeometry } from '#editor/geometry/coords.ts';
import type { PageTextRun } from '#editor/geometry/textRuns.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { signElementTypeLabel } from '#editor/registry/signLabels.ts';
import type { ReadingDirection } from '#lib/pageLayout/bands.ts';
import { PAGE_HEIGHT_DEFAULT_PTS } from '#editor/model/signGeometry.js';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { clickMarkElement, planClick, type ClickSequence, type ClickUnit } from '../lib/marker/clickMark.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import { planSweep } from '../lib/marker/sweep.ts';
import { readScanUnit } from '../lib/marker/scanUnits.ts';
import { sentenceBoxes, wordBoxes, type Box } from '../lib/text/textUnits.ts';

type Point = { x: number; y: number };

interface ClickMarksOptions {
  overlayRef: { current: HTMLElement | null };
  pageIndex: number;
  geometry: PageGeometry | undefined;
  /** Every element of the document, as of the latest render. */
  elements: EditorElement[];
  marker: Marker;
  /** The page's printed text in percent, empty on a scan. */
  textRuns: () => PageTextRun[];
  getPointerPercent: (event: MouseEvent | TouchEvent, container: HTMLElement, geometry?: PageGeometry) => Point;
  directionAt: (start: Point) => ReadingDirection;
  dispatch: (action: ElementsAction) => void;
  logAction: HistoryLogger<EditorElement>;
  setAnnouncement: (message: string) => void;
  /** A click laid this mark. */
  onMark: (element: HighlightElement) => void;
}

const locale = () => document.documentElement.lang || navigator.language;

/** The boxes of the unit under pt on a digital page, in page percent; null when pt is not on text. */
function digitalBoxes(runs: PageTextRun[], unit: ClickUnit, pt: Point): Box[] | null {
  if (unit === 'word') return wordBoxes(runs, pt, locale());
  if (unit === 'sentence') return sentenceBoxes(runs, pt, locale());
  return null;
}

/** The band of the word or line under pt on a scan, read from the displayed canvas once. */
function scanBoxes(overlay: HTMLElement, unit: ClickUnit, pt: Point, geometry: PageGeometry | undefined): Box[] | null {
  if (unit === 'sentence') return null;
  const canvas = overlay.parentElement?.querySelector<HTMLCanvasElement>('canvas') ?? null;
  const band = readScanUnit(canvas, pt, unit, geometry?.height || PAGE_HEIGHT_DEFAULT_PTS);
  return band ? [band] : null;
}

/**
 * R10 to R12: a double-click marks the word under it, a third click its sentence (the line on a scan).
 * The count is the browser's own `click.detail`. A mouse press on the page always starts a swipe, and a
 * swipe swallows the click that follows it, so the click is watched on the window's capture phase from
 * the press on, ahead of the swallow. Marks the presses laid on their own are replaced by the click's
 * mark: they sit on top of the undo stack, so removing them is undoing them, and the click's mark is
 * one undo step. Nothing here follows the pointer; it all happens on a click.
 */
export function useClickMarks(options: ClickMarksOptions) {
  const latest = useRef(options);
  latest.current = options;
  const press = useRef<{ id: string | null; laid: boolean }>({ id: null, laid: false });
  const run = useRef<string[]>([]);
  const sequence = useRef<ClickSequence | null>(null);
  const stopWatching = useRef<() => void>(() => {});
  // The mark a click just laid, waiting for its bands to be on the page to be swept in.
  const pendingSweep = useRef<{ id: string; rtl: boolean } | null>(null);

  useEffect(() => () => stopWatching.current(), []);

  // R13: after the render that puts the new mark's bands on the page, draw them in from the first letter.
  // DOM only: the clip is a Web Animation on each band, with no state per frame.
  useEffect(() => {
    const pending = pendingSweep.current;
    const overlay = latest.current.overlayRef.current;
    if (!pending || !overlay) return;
    const bands = Array.from(overlay.querySelectorAll<HTMLElement>(`[data-element-id="${pending.id}"] [data-highlight-band]`));
    if (bands.length === 0) return;
    pendingSweep.current = null;
    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const plan = planSweep({ widths: bands.map((band) => band.offsetWidth), rtl: pending.rtl, reducedMotion });
    if (!plan || typeof bands[0].animate !== 'function') return;
    bands.forEach((band, i) => band.animate(plan.frames, { ...plan.steps[i], easing: plan.easing, fill: 'backwards' }));
  });

  const handleClick = (event: MouseEvent) => {
    const o = latest.current;
    const overlay = o.overlayRef.current;
    if (!overlay || !(event.target instanceof Node) || !overlay.contains(event.target)) return;
    const inkId = press.current.laid ? press.current.id : null;
    if (event.detail <= 1) {
      sequence.current = null;
      run.current = inkId ? [inkId] : [];
      return;
    }
    if (inkId) run.current = [...run.current, inkId];
    const overId = (event.target as Element).closest?.('[data-element-id]')?.getAttribute('data-element-id') ?? null;
    const runs = o.textRuns();
    const plan = planClick({ detail: event.detail, pageKind: runs.length > 0 ? 'text' : 'scan', inks: run.current, overId, sequence: sequence.current });
    if (!plan) return;
    const at = o.getPointerPercent(event, overlay, o.geometry);
    const boxes = runs.length > 0 ? digitalBoxes(runs, plan.unit, at) : scanBoxes(overlay, plan.unit, at, o.geometry);
    if (!boxes) return;
    const element = clickMarkElement({ id: createElementId(), pageIndex: o.pageIndex, boxes, marker: o.marker, direction: o.directionAt(at) });
    if (!element) return;
    plan.replaceIds.forEach(() => o.dispatch({ type: 'UNDO' }));
    o.dispatch({ type: 'ADD_ELEMENT', payload: element });
    const label = signElementTypeLabel(englishSignMessages, 'highlight');
    const index = o.elements.filter((el) => !plan.replaceIds.includes(el.id)).length;
    o.logAction('add', 'ADD_SHAPE', o.pageIndex, formatMessage(englishSignMessages.addedShapeDescriptionTemplate, { label }), [captureAddedElement(element, index)]);
    o.setAnnouncement(formatMessage(englishSignMessages.addedShapeAnnouncementTemplate, { label }));
    recordAction('place_mark');
    run.current = [];
    sequence.current = { id: element.id, unit: plan.unit };
    pendingSweep.current = { id: element.id, rtl: element.direction === 'rtl' };
    o.onMark(element);
  };

  /** A mouse or pen press on the page: from here until its click is seen, the click is ours to read. */
  const beginPress = () => {
    stopWatching.current();
    press.current = { id: null, laid: false };
    const stop = () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('mouseup', onUp, true);
      stopWatching.current = () => {};
    };
    const onClick = (event: MouseEvent) => { stop(); handleClick(event); };
    // A press that never produces a click (released elsewhere) stops watching after its mouseup.
    const onUp = () => { window.removeEventListener('mouseup', onUp, true); setTimeout(stop, 0); };
    window.addEventListener('click', onClick, true);
    window.addEventListener('mouseup', onUp, true);
    stopWatching.current = stop;
  };

  /** The press started a swipe whose ink is this element. */
  const inkStarted = (id: string) => { press.current = { id, laid: false }; };

  /** Every action the press's swipe dispatches: it tells whether the swipe laid ink. */
  const noteSwipeAction = (id: string, action: ElementAction) => {
    if (press.current.id !== id) return;
    if (action.type === 'UPDATE_ELEMENT' && action.payload.id === id && 'bands' in action.payload.changes) press.current.laid = true;
    if (action.type === 'DELETE_ELEMENT' && action.payload === id) press.current.laid = false;
  };

  return { beginPress, inkStarted, noteSwipeAction };
}
