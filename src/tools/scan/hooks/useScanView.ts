import { useEffect, useLayoutEffect, type Dispatch, type MutableRef, type StateUpdater } from 'preact/hooks';
import type { RefObject } from 'preact';
import { reportError } from '../../../lib/telemetry/errorReport.ts';
import { playFlatten, type FlattenFrom } from '../lib/flattenAnimation.ts';
import { loadPipeline } from '../lib/loadPipeline.ts';
import { turnKeyOf } from '../lib/scanPages.ts';
import type { ScanPage, ScanWork } from '../state/scanWork.ts';
import type { initialScanState } from '../state/scanState.ts';
import type { ScanDispatch } from './scanHost.ts';
import { useKeepSelectedInView } from './useKeepSelectedInView.ts';
import { useScanFullScreen } from './useScanFullScreen.ts';

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

/** Bring the page's top into view: the first photos replace the tall empty state, and moving on from
 * the corners (whose buttons sit under the photo) would otherwise leave the person under the next view.
 * On desktop the whole card is the first screen (useFloorHeight), so that is the top of the page. */
function showEditorTop(editor: HTMLElement | null, instant = false) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const behavior = reduce || instant ? 'auto' : 'smooth';
  if (window.matchMedia?.('(min-width: 1024px)').matches) window.scrollTo?.({ top: 0, behavior });
  else editor?.scrollIntoView?.({ block: 'start', behavior });
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
  }, (err) => reportError('pdf_tool_run', err, 'scan_turn_preview'));
}

/** What the person sees change with the view: the scroll to the top, the flatten into the result, full
 * screen, the selected tile kept in sight and the turned preview the corner editor needs. */
export function useScanView(input: ScanViewInput) {
  const { state, dispatch, work, hasPages, selected, editorRef, headingRef, listRef, turnedPreviews } = input;
  const { selectedId, full } = state;
  const view = state.phase;
  useEffect(() => {
    if (hasPages && !work.hadPages) showEditorTop(editorRef.current);
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
    const target = host?.querySelector<HTMLImageElement>('[data-paper] img');
    // Only when the page is already made: an empty paper has nothing to land.
    const flatten = !!(from && view === 'result' && host && target);
    // One motion at a time: with a flatten to play, the scroll jumps first and the page moves alone.
    if (topPending) showEditorTop(editorRef.current, flatten);
    if (flatten) {
      work.stopFlatten = playFlatten(host as HTMLElement, from as FlattenFrom, target as HTMLImageElement);
    }
  }, [view, selectedId]);
  useEffect(() => () => work.stopFlatten(), []);

  const fullScreen = useScanFullScreen({ editorRef, work, dispatch, full, view, landing: state.landing });

  useKeepSelectedInView(listRef, selectedId);

  const turnKey = turnKeyOf(selected);
  useEffect(() => {
    if (view !== 'corners' || !selected || !turnKey || turnedPreviews[turnKey]) return;
    makeTurnedPreview(selected, turnKey, input);
  }, [view, turnKey, selected?.preview]);
  return fullScreen;
}
