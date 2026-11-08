/**
 * ARCH-134: the draft lifecycle every tool shares, apart from what it saves.
 *
 * `useDraftRestore` is the mount-time check: it runs once, starts in "checking" only when the head
 * script saw a draft hint, releases the caller after RESTORE_TIMEOUT_MS without cancelling the
 * check (a late restore still lands), and reports a check that threw. What a restore means stays
 * with the tool, in `run`.
 *
 * `useDraftSave` is the save engine: every distinct snapshot is a new revision; a debounced write
 * builds the record from the latest render when it fires and paints its result only while its
 * revision is still the live one (IndexedDB writes cannot be cancelled); the tab flushes on hide,
 * on pagehide and before an update reload (MEM-10); a save that failed holds ordinary updates;
 * another tab writing the same tool's work shows as 'conflict' until this tab's next save starts
 * (last writer wins).
 * The record's shape, what counts as a change, and when there is work to save stay with the tool.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { hasDraftHint, subscribeToDraftChanges } from './draftStore.ts';
import { registerBeforeUpdateReload } from '../appUpdate/updateHolds.ts';
import { useHoldUpdate } from '../hooks/useHoldUpdate.ts';
import { reportError } from '../telemetry/errorReport.ts';
import { consumeRecentOpen } from '../handoff/fileArrival.ts';

/**
 * Upper bound on how long the mount-time check may hold the caller in "checking". A real IndexedDB
 * open and read is single-digit milliseconds; this only keeps a stuck transaction from turning a
 * brief loading state into one that never ends. It does not cancel the check.
 * @testSeam
 */
export const RESTORE_TIMEOUT_MS = 4000;
const AUTOSAVE_DEBOUNCE_MS = 700;

/** Clears the blocking head script's DOM hint once a restore check has settled. */
export function clearDraftHintAttribute(): void {
  document.documentElement?.removeAttribute('data-draft-hint');
  document.documentElement?.removeAttribute('data-editor-restore');
}

type DraftSource = 'restore' | 'recent';

interface DraftRestoreInput {
  tool: string;
  enabled?: boolean;
  /**
   * The tool's restore. Resolves true when it put a draft on screen (or a hand-off won and the hint
   * belongs to that), false when there was nothing usable. Check `isCancelled()` after each await.
   */
  run(source: DraftSource, isCancelled: () => boolean): Promise<boolean>;
  /** 'nothing-restored' (default) clears the hint only when `run` resolves false; 'settled' always. */
  clearHint?: 'nothing-restored' | 'settled';
  /** The step label when the check throws. */
  errorStep?: string;
}

/**
 * Runs the tool's restore once per mount. `checking` (shown) is true while a hinted check runs;
 * `settled` (for gating saves) turns true once any check ends or times out, hint or not.
 */
export function useDraftRestore({ tool, enabled = true, run, clearHint = 'nothing-restored', errorStep = 'restore_draft' }: DraftRestoreInput): { checking: boolean; settled: boolean } {
  const [hinted] = useState(() => enabled && hasDraftHint(tool));
  const [settled, setSettled] = useState(!enabled);
  const attempted = useRef(false);
  const latestRun = useRef(run);
  latestRun.current = run;

  useEffect(() => {
    if (!enabled || attempted.current) {
      setSettled(true);
      return;
    }
    attempted.current = true;
    let cancelled = false;
    // Read before any await: the arrival mark is one-shot.
    const source: DraftSource = consumeRecentOpen(tool) ? 'recent' : 'restore';
    const settle = () => {
      if (cancelled) return;
      if (clearHint === 'settled') clearDraftHintAttribute();
      setSettled(true);
    };
    const timer = setTimeout(settle, RESTORE_TIMEOUT_MS);
    void (async () => { // reason: every outcome, a throw included, ends in settle()
      try {
        const restored = await latestRun.current(source, () => cancelled);
        if (!cancelled && !restored) clearDraftHintAttribute();
      } catch (err) {
        reportError('drafts', err, errorStep);
        if (!cancelled) clearDraftHintAttribute();
      } finally {
        clearTimeout(timer);
        settle();
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, on mount
  }, []);

  return { checking: hinted && !settled, settled };
}

type DraftSaveState = 'idle' | 'pending' | 'saved' | 'error' | 'conflict';

/** @testSeam */
export interface DraftSaveInput<R> {
  tool: string;
  enabled?: boolean;
  /** Compared item by item, by identity, each render: any change is a new revision. */
  snapshot: readonly unknown[];
  /** The current snapshot is work worth writing (a person's edit, not a clean restore or an empty page). */
  canSave: boolean;
  /** Called when a write starts, from the latest render. null means nothing to write. */
  build(): R | null | Promise<R | null>;
  /**
   * Resolves true once the record is stored. A throw counts as false and is reported. `isCurrent()`
   * tells a step after the write (attaching a preview) whether this snapshot is still the live one.
   */
  write(record: R, isCurrent: () => boolean): Promise<boolean>;
  /** The step label for reportError('drafts', ...). */
  errorStep: string;
  /** Show another tab's write of this tool's work as 'conflict', until this tab's next save starts. */
  watchConflicts?: boolean;
  /** There is work on screen, saved or not, that a conflict would concern. Defaults to `canSave`. */
  hasWork?: boolean;
  /** Work the tool queues outside `write` (a delete), awaited before an update reloads the tab. */
  drain?(): Promise<unknown>;
  debounceMs?: number;
}

/** @testSeam */
export interface DraftSave {
  /** The public state: a stale completion never shows for a newer snapshot. */
  state: DraftSaveState;
  revision: number;
  /** The stored draft already equals the current snapshot (a clean restore): nothing to write. */
  markSaved(): void;
  /** Starts a new revision now, so in-flight completions paint nothing (clearing the draft). */
  invalidate(): void;
}

/** The debounced, flush-on-exit save of one tool's draft. */
export function useDraftSave<R>(input: DraftSaveInput<R>): DraftSave {
  const { tool, enabled = true, snapshot, canSave, watchConflicts = false, debounceMs = AUTOSAVE_DEBOUNCE_MS } = input;
  const latest = useRef(input);
  latest.current = input;

  const revisionRef = useRef(0);
  const snapshotRef = useRef<readonly unknown[] | null>(null);
  const prev = snapshotRef.current;
  if (!prev || prev.length !== snapshot.length || snapshot.some((value, i) => !Object.is(value, prev[i]))) {
    snapshotRef.current = snapshot;
    revisionRef.current += 1;
  }
  const revision = revisionRef.current;

  const [saveState, setSaveState] = useState<{ state: DraftSaveState; revision: number }>({ state: 'idle', revision: 0 });
  const savedRevision = useRef(0);
  const inflight = useRef(new Map<number, Promise<void>>());

  const writeNow = (rev: number): Promise<void> | undefined => {
    if (savedRevision.current === rev) return undefined;
    const running = inflight.current.get(rev);
    if (running) return running;
    setSaveState({ state: 'pending', revision: rev });
    const run = (async () => {
      let ok = false;
      let wrote = false;
      try {
        const record = await latest.current.build();
        if (record !== null) {
          wrote = true;
          ok = await latest.current.write(record, () => rev === revisionRef.current);
        }
      } catch (err) {
        wrote = true;
        reportError('drafts', err, latest.current.errorStep);
      }
      if (rev !== revisionRef.current) return;
      if (ok) savedRevision.current = rev;
      setSaveState({ state: !wrote ? 'idle' : ok ? 'saved' : 'error', revision: rev });
    })().finally(() => inflight.current.delete(rev));
    inflight.current.set(rev, run);
    return run;
  };
  const flush = () => {
    const { enabled: on = true, canSave: can } = latest.current;
    return on && can ? writeNow(revisionRef.current) : undefined;
  };

  useEffect(() => {
    if (!enabled || !canSave || savedRevision.current === revision) return;
    setSaveState({ state: 'pending', revision });
    const timer = setTimeout(() => void writeNow(revisionRef.current), debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- writeNow reads refs only
  }, [enabled, canSave, revision, debounceMs]);

  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => { if (document.visibilityState === 'hidden') void flush(); }; // reason: writeNow reports its own failures
    const onPageHide = () => void flush();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    const unregister = registerBeforeUpdateReload(async () => {
      await flush();
      await Promise.allSettled([...inflight.current.values()]);
      await latest.current.drain?.();
    });
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      unregister();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flush reads refs only
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !watchConflicts) return undefined;
    return subscribeToDraftChanges(tool, () => {
      const { canSave: can, hasWork = can } = latest.current;
      const onScreen = hasWork || savedRevision.current === revisionRef.current;
      if (onScreen) setSaveState({ state: 'conflict', revision: revisionRef.current });
    });
  }, [enabled, watchConflicts, tool]);

  // Derived in render: a completion for an older revision never shows as this one's state.
  const state: DraftSaveState = saveState.state === 'conflict'
    ? 'conflict'
    : saveState.revision === revision
      ? saveState.state
      : canSave && enabled && savedRevision.current !== revision ? 'pending' : 'idle';

  // Work whose save failed lives only in memory, so it holds ordinary updates, not forced ones (MEM-10).
  useHoldUpdate(state === 'error', 'open');

  const api = useRef<Pick<DraftSave, 'markSaved' | 'invalidate'>>({
    markSaved() {
      savedRevision.current = revisionRef.current;
      const rev = revisionRef.current;
      // A conflict another tab raised still stands: the stored draft is theirs now.
      setSaveState((prev) => (prev.state === 'conflict' ? prev : { state: 'idle', revision: rev }));
    },
    invalidate() {
      revisionRef.current += 1;
    },
  });
  return { state, revision, ...api.current };
}
