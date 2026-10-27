/**
 * Compress's run lifecycle as one pure machine (ARCH-53). It owns the run gate, the two run tokens, the
 * run counter and the two tap flags; the island holds it through useCompressMachine and sends events.
 * Statement order in the island used to imply this lifecycle; now each step is a named event.
 */

export type RetryTap = 'idle' | 'processing' | 'done';

export interface CompressState {
  /**
   * The file gate: closed from the moment a file is accepted until it may run (an image at once, a PDF
   * once its encryption check says it is not locked), and while a password is needed. No build starts
   * behind it.
   */
  runnable: boolean;
  /**
   * Bumped on every change that invalidates an in-flight run (new file, option change, failed build).
   * A build and the previews capture it before their first await and check it after.
   */
  runToken: number;
  /** Bumped on every new file; a PDF analysis that outlives its file lands nothing. */
  analysisToken: number;
  /** e2e reads this beside data-compress-status: it counts the builds that have started. */
  runCount: number;
  /** True only after a tap on Download or Share before the build is done: the one moment the compressing look shows. */
  tapped: boolean;
  /** Analytics for the one tap the shared flow does not own: Try again. */
  retryTap: RetryTap;
}

export type CompressEvent =
  /** A file was accepted: the gate closes, the old run and analysis are invalidated, the taps start over. */
  | { type: 'fileAccepted' }
  /** The file may run (image at once, PDF once its encryption check passes). */
  | { type: 'gateOpened' }
  /** Level, target size or flatten changed: a late build must land nothing, the taps start over. */
  | { type: 'optionChanged' }
  /** A build started. */
  | { type: 'buildStarted' }
  /** A build landed, fresh or from the cache. */
  | { type: 'buildLanded' }
  /** The build failed: the run is invalidated and the taps start over. */
  | { type: 'buildFailed' }
  /** Try again after a failure: a tap, so the compressing look shows. */
  | { type: 'retryTapped' }
  /** The retried (or passthrough) result is done. */
  | { type: 'retrySettled' }
  /** A Download or Share tap before the build is done. */
  | { type: 'busyTapped' };

export const initialCompressState: CompressState = {
  runnable: false,
  runToken: 0,
  analysisToken: 0,
  runCount: 0,
  tapped: false,
  retryTap: 'idle',
};

/** Returns `state` itself when the patch changes nothing, so a caller can skip a render. */
function patch(state: CompressState, changes: Partial<CompressState>): CompressState {
  for (const key of Object.keys(changes) as (keyof CompressState)[]) {
    if (state[key] !== changes[key]) return { ...state, ...changes };
  }
  return state;
}

export function transition(state: CompressState, event: CompressEvent): CompressState {
  switch (event.type) {
    case 'fileAccepted':
      return { ...state, runnable: false, runToken: state.runToken + 1, analysisToken: state.analysisToken + 1, tapped: false, retryTap: 'idle' };
    case 'gateOpened':
      return patch(state, { runnable: true });
    case 'optionChanged':
    case 'buildFailed':
      return { ...state, runToken: state.runToken + 1, tapped: false, retryTap: 'idle' };
    case 'buildStarted':
      return { ...state, runCount: state.runCount + 1 };
    case 'buildLanded':
      return patch(state, { tapped: false });
    case 'retryTapped':
      return patch(state, { retryTap: 'processing', tapped: true });
    case 'retrySettled':
      return patch(state, { retryTap: 'done' });
    case 'busyTapped':
      return patch(state, { tapped: true });
  }
}

/** A run that captured `token` may still land: nothing has invalidated it since. */
export const isCurrentRun = (state: CompressState, token: number) => token === state.runToken;

/** An analysis that captured `token` may still land: no newer file has been accepted since. */
export const isCurrentAnalysis = (state: CompressState, token: number) => token === state.analysisToken;
