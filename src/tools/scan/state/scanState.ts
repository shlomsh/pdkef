/**
 * The scan island's lifecycle: which view the centre shows, which page is selected, what is running
 * for a page, and the scroll and focus the next view change owes the person.
 * Pages, results and options are data and stay with the island; this is only where the work is.
 */
/** The camera in the page (SCAN-08): taking pages for the scan, or one page's replacement (Retake).
 * `thenMany`: the retake came from the camera's own stack, so closing goes back to taking pages. */
export type CameraMode = { mode: 'many' } | { mode: 'one'; pageId: number; thenMany?: boolean };

interface Shared {
  selectedId: number | null;
  /** The page Find the page is running for. Outlives a view change: the run still ends. */
  finding: number | null;
  /** The page a person's split is running for. Outlives a view change, like finding. */
  splitting: number | null;
  /** The sheet whose split just failed, so its question can say so. */
  splitFailed: number | null;
  /** Pages where Find the page ran on request and found nothing. */
  findMissed: number[];
  /** Pages whose photo could not be read or processed. */
  failedIds: number[];
  /** A view change owes the page's top in view. */
  topPending: boolean;
  /** A view change owes the page heading focus. */
  focusPending: boolean;
  /** The viewfinder, open over whichever view, or null. */
  camera: CameraMode | null;
}

/** The centre shows all the pages (`table`); a tapped page opens as it will download (`result`);
 * corners are a mode you step into from there. A PDF sheet that may be two pages asks in `split`. */
type ScanState = Shared & ({ phase: 'table' } | { phase: 'result' } | { phase: 'corners' } | { phase: 'split' });

type ScanEvent =
  | { type: 'photosAdded'; firstId: number }
  | { type: 'pageSelected'; id: number }
  | { type: 'cornersOpened'; focus: boolean }
  | { type: 'failedPageShown'; id: number }
  | { type: 'resultShown' }
  | { type: 'splitAsked'; id: number }
  | { type: 'splitStarted'; id: number }
  | { type: 'splitEnded'; id: number; failed: boolean }
  | { type: 'splitMade'; oldId: number; newId: number }
  | { type: 'pageOpened'; id: number }
  | { type: 'tableShown' }
  | { type: 'pageRetaken'; oldId: number; newId: number }
  | { type: 'scrollFocusRequested'; top?: boolean; focus?: boolean }
  | { type: 'scrollFocusConsumed' }
  | { type: 'findStarted'; id: number }
  | { type: 'findEnded' }
  | { type: 'findMissed'; id: number }
  | { type: 'findFound'; id: number }
  | { type: 'pageFailed'; id: number }
  | { type: 'failureCleared'; id: number }
  | { type: 'pageRemoved'; id: number; neighbourId: number | null }
  | { type: 'pageRestored'; id: number; failed: boolean }
  | { type: 'cleared' }
  | { type: 'cameraOpened'; camera: CameraMode }
  | { type: 'retakeOpened'; pageId: number }
  | { type: 'cameraClosed' };

export const initialScanState: ScanState = {
  phase: 'table',
  selectedId: null,
  finding: null,
  splitting: null,
  splitFailed: null,
  findMissed: [],
  failedIds: [],
  topPending: false,
  focusPending: false,
  camera: null,
};

/** The same state when the patch changes nothing, so an event that does not apply is a no-op. */
function patch(state: ScanState, changes: Partial<ScanState>): ScanState {
  const keys = Object.keys(changes) as (keyof ScanState)[];
  return keys.every((k) => state[k] === changes[k]) ? state : ({ ...state, ...changes } as ScanState);
}

const withId = (ids: number[], id: number) => (ids.includes(id) ? ids : [...ids, id]);
const withoutId = (ids: number[], id: number) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids);

export function reduceScan(state: ScanState, event: ScanEvent): ScanState {
  switch (event.type) {
    case 'photosAdded':
      // New photos land on the table; the first is selected so the table shows where they went.
      return patch(state, { selectedId: event.firstId, phase: 'table', topPending: true });
    case 'pageSelected':
      return patch(state, { selectedId: event.id });
    case 'cornersOpened':
      return patch(state, event.focus ? { phase: 'corners', focusPending: true } : { phase: 'corners' });
    case 'failedPageShown':
      return patch(state, { selectedId: event.id, phase: 'corners', topPending: true, focusPending: true });
    case 'resultShown':
      return patch(state, { phase: 'result' });
    case 'splitAsked':
      return patch(state, { selectedId: event.id, phase: 'split', topPending: true, focusPending: true });
    case 'splitStarted':
      return patch(state, { splitting: event.id, splitFailed: null });
    case 'splitEnded':
      // A sheet's split can end while a later one runs: that one keeps its hold on its buttons.
      return patch(state, {
        splitting: state.splitting === event.id ? null : state.splitting,
        splitFailed: event.failed ? event.id : state.splitFailed,
      });
    case 'splitMade':
      // The two pages take the sheet's place on screen only if the person is still looking at it.
      return patch(state, {
        ...(state.selectedId === event.oldId ? { selectedId: event.newId } : {}),
        ...(state.phase === 'split' && state.selectedId === event.oldId ? { phase: 'result' as const } : {}),
        failedIds: withoutId(state.failedIds, event.oldId),
        findMissed: withoutId(state.findMissed, event.oldId),
      });
    case 'pageOpened':
      return patch(state, { selectedId: event.id, phase: 'result', topPending: true, focusPending: true });
    case 'tableShown':
      return patch(state, { phase: 'table' });
    case 'pageRetaken':
      return patch(state, {
        selectedId: event.newId,
        failedIds: withoutId(state.failedIds, event.oldId),
        findMissed: withoutId(state.findMissed, event.oldId),
      });
    case 'scrollFocusRequested':
      return patch(state, {
        ...(event.top ? { topPending: true } : {}),
        ...(event.focus ? { focusPending: true } : {}),
      });
    case 'scrollFocusConsumed':
      return patch(state, { topPending: false, focusPending: false });
    case 'findStarted':
      return patch(state, { finding: event.id });
    case 'findEnded':
      return patch(state, { finding: null });
    case 'findMissed':
      return patch(state, { findMissed: withId(state.findMissed, event.id) });
    case 'findFound':
      return patch(state, { findMissed: withoutId(state.findMissed, event.id) });
    case 'pageFailed':
      return patch(state, { failedIds: withId(state.failedIds, event.id) });
    case 'failureCleared':
      return patch(state, { failedIds: withoutId(state.failedIds, event.id) });
    case 'pageRemoved': {
      const failedIds = withoutId(state.failedIds, event.id);
      if (state.selectedId !== event.id) return patch(state, { failedIds });
      // The open page went: on its neighbour, in the viewer if it was in one (on its corners if it could
      // not be read, as failedPageShown opens it); with none left, the table.
      const inViewer = state.phase !== 'table' && event.neighbourId !== null;
      const onward = failedIds.includes(event.neighbourId as number) ? 'corners' : 'result';
      return patch(state, { failedIds, selectedId: event.neighbourId, phase: inViewer ? onward : 'table' });
    }
    case 'pageRestored':
      return patch(state, { selectedId: event.id, failedIds: event.failed ? withId(state.failedIds, event.id) : state.failedIds });
    case 'cleared':
      return patch(state, { phase: 'table', selectedId: null, failedIds: state.failedIds.length > 0 ? [] : state.failedIds });
    case 'cameraOpened':
      return patch(state, { camera: event.camera });
    case 'retakeOpened':
      // Over the running camera the one-page screen steps aside; over the table it stays, under the camera.
      return state.camera?.mode === 'many'
        ? patch(state, { phase: 'table', camera: { mode: 'one', pageId: event.pageId, thenMany: true } })
        : patch(state, { camera: { mode: 'one', pageId: event.pageId } });
    case 'cameraClosed':
      return patch(state, { camera: state.camera?.mode === 'one' && state.camera.thenMany ? { mode: 'many' } : null });
  }
}
