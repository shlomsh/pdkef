/* The person's side of the finish flow (useDownloadFlow) as one pure reducer.
   `handoffBusy` is not here: it must stay on useNavigatingAway() (bfcache rule).

   Transitions (each was a setter call before ARCH-133):
   event               trigger                                  was
   DOWNLOAD_TAPPED     tap on a ready Download                  setTap(processing) + setDownloadedOnce(true) [+ setStripOpen(true) on a phone, quiet tap]
   PREPARING_TAPPED    tap that beat the build                  setTap(processing) + setPendingDownload(true) + quietPendingRef = openStrip
   PART_SAVED          one page's image saved from its cell     setTap(processing)
   SHARED              a completed Share                        setTap(processing)
   SETTLED             processing, nothing waiting, ready       setTap(done)
   OUTPUT_DELIVERED    a waiting tap's output became ready      setPendingDownload(false) + quietPendingRef + setStripOpen(true) + setTap(done) + setDownloadedOnce(true)
   OUTPUT_STALE        output no longer ready                   setDownloadedOnce(false) + setHandoffFailed(false)
   HANDOFF_STARTED     a hand-off begins                        setHandoffFailed(false)
   HANDOFF_FAILED      a hand-off save threw                    setHandoffFailed(true)
   STRIP_CLOSED        left 'saved', widened past 1023px, closeStrip   setStripOpen(false)
   RESET               Clear all / new file                     the nine-line list in reset()
   A waiting tap is a `processing` tap with `waiting` set; it can only be created by PREPARING_TAPPED and
   only ended by OUTPUT_DELIVERED or RESET, which is why pendingDownload and the quiet-strip ref are one field. */

interface DownloadFlowCommon {
  /** The phone done strip under the sticky bar (only the saved output keeps it open). */
  stripOpen: boolean;
  /** Any delivery counts (the rating ask waits on it). */
  downloadedOnce: boolean;
  handoffFailed: boolean;
}

/** @testSeam */
export type DownloadFlowState = DownloadFlowCommon & (
  | { tap: 'idle' }
  /** `waiting` is a tap that beat the build; `openStrip` is whether its delivery opens the strip. */
  | { tap: 'processing'; waiting: { openStrip: boolean } | null }
  | { tap: 'done' }
);

type DownloadFlowEvent =
  | { type: 'DOWNLOAD_TAPPED'; openStrip: boolean }
  | { type: 'PREPARING_TAPPED'; openStrip: boolean }
  | { type: 'PART_SAVED' }
  | { type: 'SHARED' }
  | { type: 'SETTLED' }
  | { type: 'OUTPUT_DELIVERED' }
  | { type: 'OUTPUT_STALE' }
  | { type: 'HANDOFF_STARTED' }
  | { type: 'HANDOFF_FAILED' }
  | { type: 'STRIP_CLOSED' }
  | { type: 'RESET' };

export const initialDownloadFlow: DownloadFlowState = { tap: 'idle', stripOpen: false, downloadedOnce: false, handoffFailed: false };

/** A tap moves to 'processing' and keeps any tap already waiting on the build. */
const processing = (state: DownloadFlowState): DownloadFlowState => (
  state.tap === 'processing' ? state : { ...state, tap: 'processing', waiting: null }
);

export function downloadFlowReducer(state: DownloadFlowState, event: DownloadFlowEvent): DownloadFlowState {
  switch (event.type) {
    case 'DOWNLOAD_TAPPED': {
      const next = processing(state);
      return { ...next, downloadedOnce: true, stripOpen: next.stripOpen || event.openStrip };
    }
    case 'PREPARING_TAPPED':
      return { ...state, tap: 'processing', waiting: { openStrip: event.openStrip } };
    case 'PART_SAVED':
    case 'SHARED':
      return processing(state);
    case 'SETTLED':
      return state.tap === 'processing' && !state.waiting ? { ...state, tap: 'done' } : state;
    case 'OUTPUT_DELIVERED': {
      const openStrip = state.tap === 'processing' && !!state.waiting?.openStrip;
      return { tap: 'done', stripOpen: state.stripOpen || openStrip, downloadedOnce: true, handoffFailed: state.handoffFailed };
    }
    case 'OUTPUT_STALE':
      return state.downloadedOnce || state.handoffFailed ? { ...state, downloadedOnce: false, handoffFailed: false } : state;
    case 'HANDOFF_STARTED':
      return state.handoffFailed ? { ...state, handoffFailed: false } : state;
    case 'HANDOFF_FAILED':
      return state.handoffFailed ? state : { ...state, handoffFailed: true };
    case 'STRIP_CLOSED':
      return state.stripOpen ? { ...state, stripOpen: false } : state;
    case 'RESET':
      return initialDownloadFlow;
  }
}
