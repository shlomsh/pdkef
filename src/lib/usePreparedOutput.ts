import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useObjectUrls } from './useObjectUrls.js';
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

export interface PreparedOutputInput {
  /** Changes whenever the output would change; null puts the hook in `idle`
   * (nothing to build). */
  key: string | null;
  /** Builds the output for the current inputs; reads them through a ref the
   * caller keeps current, so it is only ever called for the latest key. */
  build: (signal: AbortSignal, onProgress: (fraction: number) => void) => Promise<Built>;
  /** Turns a failed build into a reportable cause and reports it, or ignores it. */
  onBuildError?: (error: unknown) => void;
  /** Tests shorten the wait; the tools never pass it. */
  quietPolicy?: QuietPolicy;
  /** Default true. False withdraws on a key change as usual but builds nothing
   * until `prepareNow` (a long document builds on hover, focus or tap). */
  autoBuild?: boolean;
}

export interface PreparedOutput {
  status: PreparedStatus;
  /** Null for a parts output. */
  blob: Blob | null;
  url: string | null;
  /** The files of a multi-file output; null for a single blob. */
  parts: PreparedPart[] | null;
  /** Output pages of the blob that `url` points at (or of all parts), and its size. */
  pageCount: number;
  size: number;
  /** 0..1 while building. */
  progress: number;
  error: Error | null;
  /** Bumps whenever a blob becomes ready, so a caller waiting for "the
   * result of the tap I just made" can tell a fresh blob from the old one. */
  generation: number;
  /** Start the build now instead of waiting for quiet (hover, focus, tap). */
  prepareNow: () => void;
}

/** A build resolves one blob or several parts, never both. */
export type Built = { blob: Blob; pageCount: number } | { parts: OutputPart[]; pageCount: number };

export function usePreparedOutput(input: PreparedOutputInput): PreparedOutput {
  const { key, build, onBuildError, quietPolicy, autoBuild = true } = input;
  const { url, setBlob, clear } = useObjectUrls();
  const [state, setState] = useState<{
    status: PreparedStatus; blob: Blob | null; parts: PreparedPart[] | null; pageCount: number; error: Error | null; generation: number;
  }>({ status: 'idle', blob: null, parts: null, pageCount: 0, error: null, generation: 0 });
  const [progress, setProgress] = useState(0);
  const preparerRef = useRef<ReturnType<typeof createQuietPreparer<Built>> | null>(null);
  const keyRef = useRef<string | null>(null);
  const autoBuildRef = useRef(autoBuild);
  autoBuildRef.current = autoBuild;
  /** Every object URL made for the parts on screen; revoked whenever they go. */
  const partUrlsRef = useRef<string[]>([]);
  const revokePartUrls = () => {
    for (const partUrl of partUrlsRef.current) URL.revokeObjectURL(partUrl);
    partUrlsRef.current = [];
  };
  /** The preparer is made once, so it reaches the latest callbacks through this. */
  const callbacksRef = useRef({ build, onBuildError });
  callbacksRef.current = { build, onBuildError };

  useEffect(() => {
    const preparer = createQuietPreparer<Built>({
      policy: quietPolicy,
      build: async (_key, signal) => {
        setProgress(0);
        return callbacksRef.current.build(signal, (fraction: number) => { if (!signal.aborted) setProgress(fraction); });
      },
      onReady: (readyKey, built) => {
        if (readyKey !== keyRef.current) return;
        const blob = 'blob' in built ? built.blob : null;
        revokePartUrls();
        const parts = 'parts' in built
          ? built.parts.map((part) => ({ ...part, url: URL.createObjectURL(part.blob) }))
          : null;
        partUrlsRef.current = parts?.map((part) => part.url) ?? [];
        setBlob(blob);
        setState((current) => ({ status: 'ready', blob, parts, pageCount: built.pageCount, error: null, generation: current.generation + 1 }));
      },
      onError: (errorKey, error) => {
        // expected: a superseded build is aborted on purpose and is not a failure
        if ((error as DOMException)?.name === 'AbortError' || errorKey !== keyRef.current) return;
        callbacksRef.current.onBuildError?.(error);
        console.error(error);
        revokePartUrls();
        setState((current) => ({ status: 'error', blob: null, parts: null, pageCount: 0, error: error as Error, generation: current.generation }));
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

  useEffect(() => {
    const preparer = preparerRef.current;
    if (!preparer) return;
    if (key === null) {
      keyRef.current = null;
      preparer.dispose();
      setState((current) => (current.status === 'idle' && !current.blob && !current.parts ? current : { status: 'idle', blob: null, parts: null, pageCount: 0, error: null, generation: current.generation }));
      clear();
      revokePartUrls();
      setProgress(0);
      return;
    }
    // Any change withdraws the previous blob at once: the Download link must
    // never hand out a result for an order the person has since changed. A
    // cache hit inside change() restores a built state in the same commit.
    keyRef.current = key;
    setState((current) => ({ status: 'pending', blob: null, parts: null, pageCount: 0, error: null, generation: current.generation }));
    clear();
    revokePartUrls();
    setProgress(0);
    preparer.change(key, autoBuildRef.current);
  }, [key]);

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
      setState((current) => ({ status: 'pending', blob: null, parts: null, pageCount: 0, error: null, generation: current.generation }));
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
    size: state.blob?.size ?? state.parts?.reduce((total, part) => total + part.blob.size, 0) ?? 0,
    progress,
    error: state.error,
    generation: state.generation,
    prepareNow,
  };
}
