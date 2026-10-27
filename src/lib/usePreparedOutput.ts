import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useObjectUrls } from './useObjectUrls.js';
import { isAbortError } from './abort.js';
import { createQuietPreparer, type QuietPolicy } from './quietPrepare.ts';

/* Guideline §2, "Quiet means quiet": the output blob is built in the
   background once the person has gone quiet (src/lib/quietPrepare.ts decides
   how long), and nothing on screen changes while that happens. `pending`
   covers both the quiet wait and the build itself; the tool shows 'preparing'
   only if the person taps before the blob lands. Built blobs are cached by
   state key, so an undo back to a built state is ready with no build. */

/** One file of a multi-file output (Split's one PDF per page). */
export interface OutputPart { blob: Blob; filename: string; /** The 1-based source page an image came from. */ pageNumber?: number }

/** A part of a ready output, with the object URL a download link points at. */
export type PreparedPart = OutputPart & { url: string };

export type PreparedStatus = 'idle' | 'pending' | 'ready' | 'error';

export interface PreparedOutputInput<M = unknown> {
  /** Changes whenever the output would change; null puts the hook in `idle`
   * (nothing to build). */
  key: string | null;
  /** Builds the output for the current inputs; reads them through a ref the
   * caller keeps current, so it is only ever called for the latest key. */
  build: (signal: AbortSignal, onProgress: (fraction: number) => void) => Promise<Built<M>>;
  /** Turns a failed build into a reportable cause and reports it, or ignores it. */
  onBuildError?: (error: unknown) => void;
  /** Called the moment a build for the current key lands (fresh or from the cache), before the
   * state it sets renders, so a tool can start follow-up work (Compress's previews) with no frame lost. */
  onReady?: (built: Built<M>) => void;
  /** Tests shorten the wait; the tools never pass it. */
  quietPolicy?: QuietPolicy;
  /** Default true. False withdraws on a key change as usual but builds nothing
   * until `prepareNow` (a long document builds on hover, focus or tap). */
  autoBuild?: boolean;
  /** Identifies the document the key belongs to. When it changes, every cached result is dropped, so a
   * hook that lives as long as its island does not hold a replaced file's blobs. */
  cacheScope?: unknown;
}

export interface PreparedOutput<M = unknown> {
  status: PreparedStatus;
  /** Null for a parts output. */
  blob: Blob | null;
  url: string | null;
  /** The files of a multi-file output; null for a single blob. */
  parts: PreparedPart[] | null;
  /** Output pages of the blob that `url` points at (or of all parts), and its size. */
  pageCount: number;
  size: number;
  /** What the build returned beside the blob (Compress's sizes and flags); null until ready. */
  meta: M | null;
  /** 0..1 while building. */
  progress: number;
  error: Error | null;
  /** Bumps whenever a blob becomes ready, so a caller waiting for "the
   * result of the tap I just made" can tell a fresh blob from the old one. */
  generation: number;
  /** Start the build now instead of waiting for quiet (hover, focus, tap). */
  prepareNow: () => void;
}

/** A build resolves one blob or several parts, never both, and may carry a `meta` value the caller reads back. */
export type Built<M = unknown> = ({ blob: Blob; pageCount: number } | { parts: OutputPart[]; pageCount: number }) & { meta?: M };

export function usePreparedOutput<M = unknown>(input: PreparedOutputInput<M>): PreparedOutput<M> {
  const { key, build, onBuildError, onReady, quietPolicy, autoBuild = true, cacheScope } = input;
  const { url, setBlob, clear } = useObjectUrls();
  const [state, setState] = useState<{
    status: PreparedStatus; blob: Blob | null; parts: PreparedPart[] | null; pageCount: number; meta: M | null; error: Error | null; generation: number;
  }>({ status: 'idle', blob: null, parts: null, pageCount: 0, meta: null, error: null, generation: 0 });
  const [progress, setProgress] = useState(0);
  const preparerRef = useRef<ReturnType<typeof createQuietPreparer<Built<M>>> | null>(null);
  const keyRef = useRef<string | null>(null);
  /** The key whose aborted build has already been re-armed once. */
  const rearmedKeyRef = useRef<string | null>(null);
  const autoBuildRef = useRef(autoBuild);
  autoBuildRef.current = autoBuild;
  /** Every object URL made for the parts on screen; revoked whenever they go. */
  const partUrlsRef = useRef<string[]>([]);
  const revokePartUrls = () => {
    for (const partUrl of partUrlsRef.current) URL.revokeObjectURL(partUrl);
    partUrlsRef.current = [];
  };
  /** The preparer is made once, so it reaches the latest callbacks through this. */
  const callbacksRef = useRef({ build, onBuildError, onReady });
  callbacksRef.current = { build, onBuildError, onReady };

  useEffect(() => {
    const preparer = createQuietPreparer<Built<M>>({
      policy: quietPolicy,
      build: async (_key, signal) => {
        setProgress(0);
        return callbacksRef.current.build(signal, (fraction: number) => { if (!signal.aborted) setProgress(fraction); });
      },
      onReady: (readyKey, built) => {
        if (readyKey !== keyRef.current) return;
        callbacksRef.current.onReady?.(built);
        const blob = 'blob' in built ? built.blob : null;
        revokePartUrls();
        const parts = 'parts' in built
          ? built.parts.map((part) => ({ ...part, url: URL.createObjectURL(part.blob) }))
          : null;
        partUrlsRef.current = parts?.map((part) => part.url) ?? [];
        setBlob(blob);
        setState((current) => ({ status: 'ready', blob, parts, pageCount: built.pageCount, meta: built.meta ?? null, error: null, generation: current.generation + 1 }));
      },
      onError: (errorKey, error) => {
        if (errorKey !== keyRef.current) return;
        // expected: a superseded build is aborted on purpose and is not a failure. A supersede that did not
        // change the key (a tool bumped its own token) would leave the key pending for good, so the current
        // key is armed again, once per key change: a build that always aborts must not spin.
        if (isAbortError(error)) {
          if (rearmedKeyRef.current !== errorKey) {
            rearmedKeyRef.current = errorKey;
            preparerRef.current?.change(errorKey, autoBuildRef.current);
          }
          return;
        }
        callbacksRef.current.onBuildError?.(error);
        console.error(error);
        revokePartUrls();
        setState((current) => ({ status: 'error', blob: null, parts: null, pageCount: 0, meta: null, error: error as Error, generation: current.generation }));
      },
    });
    preparerRef.current = preparer;
    return () => {
      preparer.dispose();
      preparerRef.current = null;
      revokePartUrls();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Points the preparer at `nextKey`. Idempotent per key, so the render below and the effect can both call it. */
  const appliedKeyRef = useRef<string | null | undefined>(undefined);
  const appliedScopeRef = useRef<unknown>(cacheScope);
  const applyKey = (nextKey: string | null) => {
    const preparer = preparerRef.current;
    if (!preparer) return;
    if (appliedScopeRef.current !== cacheScope) {
      appliedScopeRef.current = cacheScope;
      preparer.clearCache();
    }
    if (appliedKeyRef.current === nextKey) return;
    appliedKeyRef.current = nextKey;
    if (nextKey === null) {
      keyRef.current = null;
      preparer.dispose();
      setState((current) => (current.status === 'idle' && !current.blob && !current.parts ? current : { status: 'idle', blob: null, parts: null, pageCount: 0, meta: null, error: null, generation: current.generation }));
      clear();
      revokePartUrls();
      setProgress(0);
      return;
    }
    // Any change withdraws the previous blob at once: the Download link must
    // never hand out a result for an order the person has since changed. A
    // cache hit inside change() restores a built state in the same commit.
    keyRef.current = nextKey;
    rearmedKeyRef.current = null;
    setState((current) => ({ status: 'pending', blob: null, parts: null, pageCount: 0, meta: null, error: null, generation: current.generation }));
    clear();
    revokePartUrls();
    setProgress(0);
    preparer.change(nextKey, autoBuildRef.current);
  };
  // Registered while rendering, not after paint: a tool whose gate opens right after the render that
  // brought the key (Compress's password check) must be able to start the build in that same tick.
  // The first key still waits for the effect, since the preparer is made there.
  applyKey(key);
  useEffect(() => { applyKey(key); }, [key]);

  // Turning autoBuild on starts the quiet wait for a key still waiting to build.
  const wasAutoBuild = useRef(autoBuild);
  useEffect(() => {
    const turnedOn = autoBuild && !wasAutoBuild.current;
    wasAutoBuild.current = autoBuild;
    const preparer = preparerRef.current;
    if (turnedOn && preparer && keyRef.current !== null && preparer.pendingKey !== null && !preparer.building) {
      preparer.change(keyRef.current);
    }
  }, [autoBuild]);

  // After a failed build the preparer has nothing pending, so a tap rebuilds
  // the current key (the way the old Apply button could always be pressed again).
  const failed = state.status === 'error';
  const prepareNow = useCallback(() => {
    const preparer = preparerRef.current;
    if (!preparer) return;
    if (failed && keyRef.current !== null) {
      setState((current) => ({ status: 'pending', blob: null, parts: null, pageCount: 0, meta: null, error: null, generation: current.generation }));
      setProgress(0);
      preparer.change(keyRef.current, false);
    }
    preparer.now();
  }, [failed]);

  return {
    status: state.status,
    blob: state.blob,
    url,
    parts: state.parts,
    pageCount: state.pageCount,
    meta: state.meta,
    size: state.blob?.size ?? state.parts?.reduce((total, part) => total + part.blob.size, 0) ?? 0,
    progress,
    error: state.error,
    generation: state.generation,
    prepareNow,
  };
}
