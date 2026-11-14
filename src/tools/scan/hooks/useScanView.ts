import { useEffect, useLayoutEffect, useRef, type Dispatch, type MutableRef, type StateUpdater } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { playFlatten, relativeBox, type FlattenFrom } from '../lib/flattenAnimation.ts';
import { loadPipeline } from '../lib/loadPipeline.ts';
import { turnedQuad } from '../lib/quad.ts';
import { turnKeyOf } from '../lib/scanPages.ts';
import type { ScanPage, ScanWork } from '../state/scanWork.ts';
import type { initialScanState } from '../state/scanState.ts';
import type { ScanDispatch } from './scanHost.ts';

interface ScanViewInput {
  state: typeof initialScanState;
  dispatch: ScanDispatch;
  work: ScanWork;
  hasPages: boolean;
  selected: ScanPage | undefined;
  editorRef: RefObject<HTMLElement>;
  headingRef: RefObject<HTMLParagraphElement>;
  listRef: RefObject<HTMLElement>;
  unmountedRef: MutableRef<boolean>;
  turnedPreviews: Record<string, string>;
  setTurnedPreviews: Dispatch<StateUpdater<Record<string, string>>>;
}

/** Bring the table's top into view when the first photos replace the tall empty state. The viewer is a
 * fixed dialog over the table, so a page view has nothing to scroll to. */
function showTableTop() {
  if (!window.matchMedia?.('(min-width: 1024px)').matches) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo?.({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
}

/** A turned page shows its preview turned the same way while its corners are set (scanPipeline's turnImage).
 * Outside the queue: it is one preview-sized image, and it should not wait behind a build. */
function makeTurnedPreview(page: ScanPage, turnKey: string, { work, unmountedRef, setTurnedPreviews }: ScanViewInput) {
  const blob = work.previewBlobs.get(page.id);
  if (!blob) return;
  const { id, turns } = page;
  loadPipeline().then((pipeline) => pipeline.turnImage(blob, turns)).then((turned) => {
    if (unmountedRef.current || work.removed.has(id)) return;
    setTurnedPreviews((map) => (map[turnKey] ? map : { ...map, [turnKey]: URL.createObjectURL(turned) }));
  }, (err) => {
    reportError('pdf_tool_run', err, 'scan_turn_preview');
    // Blank is a dead end: the unturned photo keeps the corners box usable, and the person can still go on.
    if (unmountedRef.current || work.removed.has(id) || !page.preview) return;
    const fallback = page.preview;
    setTurnedPreviews((map) => (map[turnKey] ? map : { ...map, [turnKey]: fallback }));
  });
}

/** What the person sees change with the view: the scroll to the top, the flatten into the result, the
 * last page's tile focused and in view when the viewer closes, and the turned preview the corner editor needs. */
export function useScanView(input: ScanViewInput) {
  const { state, dispatch, work, hasPages, selected, editorRef, headingRef, listRef, turnedPreviews } = input;
  const { selectedId } = state;
  const view = state.phase;
  useEffect(() => {
    if (hasPages && !work.hadPages) showTableTop();
    work.hadPages = hasPages;
  }, [hasPages]);
  // Before paint: the result's first frame already has the flatten over it. After paint, the empty paper
  // showed for one frame before the photo came back over it (Scan QA, Pixel 7).
  useLayoutEffect(() => {
    // Whatever was playing belongs to the view that just went.
    work.stopFlatten();
    work.stopFlatten = () => {};
    // Asked for by a view change, run once the new view is laid out (the scroll target moves with it).
    const { topPending, focusPending } = state;
    if (topPending || focusPending) dispatch({ type: 'scrollFocusConsumed' });
    if (focusPending) headingRef.current?.focus({ preventScroll: true });
    const from = work.flattenFrom;
    work.flattenFrom = null;
    const host = editorRef.current;
    // The phone's viewer holds its neighbours too: the page that lands is the current one.
    const target = host?.querySelector<HTMLImageElement>('[data-current] [data-paper] img') ?? host?.querySelector<HTMLImageElement>('[data-paper] img');
    // Only when the page is already made: an empty paper has nothing to land.
    const flatten = !!(from && view === 'result' && host && target);
    if (topPending && view === 'table') showTableTop();
    if (flatten) {
      work.stopFlatten = playFlatten(host as HTMLElement, from as FlattenFrom, target as HTMLImageElement);
    }
  }, [view, selectedId]);
  useEffect(() => () => work.stopFlatten(), []);

  // Back from a page: focus lands on the tile of the page last shown, not the one that opened it, and it
  // is brought into view (the grid is the window's, so the tile is scrolled to, not the list).
  const wasPageView = useRef(false);
  useEffect(() => {
    if (view === 'table' && wasPageView.current && !state.camera) {
      const tile = listRef.current?.querySelector<HTMLElement>(`[data-id="${selectedId}"] [data-page]`);
      tile?.focus({ preventScroll: true });
      tile?.scrollIntoView?.({ block: 'nearest' });
    }
    wasPageView.current = view !== 'table';
  }, [view]);

  /** The corners' own photo, already decoded, is where the flatten starts: the viewer is the same dialog. */
  const captureFlatten = (page: { quad: Quad; turns: number }) => {
    const host = editorRef.current;
    const frame = host?.querySelector('[data-corner-frame]');
    const photo = frame?.querySelector<HTMLImageElement>('img');
    if (!host || !frame || !photo) return;
    work.flattenFrom = {
      photo,
      frame: relativeBox(frame.getBoundingClientRect(), host.getBoundingClientRect()),
      quad: turnedQuad(page.quad, page.turns),
    };
  };
  const showResult = (page: ScanPage) => {
    captureFlatten(page);
    dispatch({ type: 'resultShown' });
  };

  const turnKey = turnKeyOf(selected);
  useEffect(() => {
    if (view !== 'corners' || !selected || !turnKey || turnedPreviews[turnKey]) return;
    makeTurnedPreview(selected, turnKey, input);
  }, [view, turnKey, selected?.preview]);
  return { showResult };
}
