import type { Quad } from '../lib/quad.ts';

/**
 * The scan island's lifecycle: which view the centre shows, which page is selected, what is running
 * for a page, full screen, and the scroll and focus the next view change owes the person.
 * Pages, results and options are data and stay with the island; this is only where the work is.
 */
type FullMode = 'native' | 'layer' | null;
/** Approved full screen: the page whose flatten starts once the card is back on screen. */
interface Landing { quad: Quad; turns: number }

interface Shared {
  selectedId: number | null;
  /** The page Find the page is running for. Outlives a view change: the run still ends. */
  finding: number | null;
  /** Pages where Find the page ran on request and found nothing. */
  findMissed: number[];
  /** Pages whose photo could not be read or processed. */
  failedIds: number[];
  full: FullMode;
  landing: Landing | null;
  /** A view change owes the page's top in view. */
  topPending: boolean;
  /** A view change owes the page heading focus. */
  focusPending: boolean;
}

/** The centre shows the page as it will download (`result`); corners are a mode you step into. */
type ScanState = Shared & ({ phase: 'result' } | { phase: 'corners' });

type ScanEvent =
  | { type: 'photosAdded'; firstId: number }
  | { type: 'pageSelected'; id: number }
  | { type: 'cornersOpened'; focus: boolean }
  | { type: 'failedPageShown'; id: number }
  | { type: 'resultShown' }
  | { type: 'scrollFocusRequested'; top?: boolean; focus?: boolean }
  | { type: 'scrollFocusConsumed' }
  | { type: 'findStarted'; id: number }
  | { type: 'findEnded' }
  | { type: 'findMissed'; id: number }
  | { type: 'findFound'; id: number }
  | { type: 'pageFailed'; id: number }
  | { type: 'failureCleared'; id: number }
  | { type: 'pageRemoved'; id: number; neighbourId: number | null; nextNewId: number | null }
  | { type: 'cleared' }
  | { type: 'fullscreenChanged'; native: boolean }
  | { type: 'fullLayerEntered' }
  | { type: 'fullExited' }
  | { type: 'resultAfterFullQueued'; landing: Landing }
  | { type: 'resultAfterFullShown' };

export const initialScanState: ScanState = {
  phase: 'result',
  selectedId: null,
  finding: null,
  findMissed: [],
  failedIds: [],
  full: null,
  landing: null,
  topPending: false,
  focusPending: false,
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
      // A new photo is shown first as itself, corners on top, to approve or adjust.
      return patch(state, { selectedId: event.firstId, phase: 'corners', topPending: true });
    case 'pageSelected':
      return patch(state, { selectedId: event.id });
    case 'cornersOpened':
      return patch(state, event.focus ? { phase: 'corners', focusPending: true } : { phase: 'corners' });
    case 'failedPageShown':
      return patch(state, { selectedId: event.id, phase: 'corners', topPending: true, focusPending: true });
    case 'resultShown':
      return patch(state, { phase: 'result' });
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
      // Removing the photo under review: on to the next new one, or to the result when none is left.
      return patch(state, {
        failedIds,
        selectedId: event.nextNewId ?? event.neighbourId,
        ...(state.phase === 'corners' && event.nextNewId === null ? { phase: 'result' as const } : {}),
        // A new photo opens in view, whether this one went from its own box or from the strip.
        ...(event.nextNewId !== null ? { topPending: true } : {}),
      });
    }
    case 'cleared':
      return patch(state, { phase: 'result', selectedId: null, failedIds: state.failedIds.length > 0 ? [] : state.failedIds });
    case 'fullscreenChanged':
      return patch(state, { full: event.native ? 'native' : state.full === 'native' ? null : state.full });
    case 'fullLayerEntered':
      return patch(state, { full: 'layer' });
    case 'fullExited':
      return patch(state, { full: null });
    case 'resultAfterFullQueued':
      return patch(state, { landing: event.landing });
    case 'resultAfterFullShown':
      // Only once the card is back on screen with a page waiting.
      return state.full === null && state.landing !== null ? patch(state, { landing: null, phase: 'result' }) : state;
  }
}
