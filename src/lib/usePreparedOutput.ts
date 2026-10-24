import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useObjectUrls } from './useObjectUrls.js';
import { createQuietPreparer, type QuietPolicy } from './quietPrepare.ts';

/* Guideline §2, "Quiet means quiet": the output blob is built in the
   background once the person has gone quiet (src/lib/quietPrepare.ts decides
   how long), and nothing on screen changes while that happens. `pending`
   covers both the quiet wait and the build itself; the tool shows 'preparing'
   only if the person taps before the blob lands. Built blobs are cached by
   state key, so an undo back to a built state is ready with no build. */

export type PreparedStatus = 'idle' | 'pending' | 'ready' | 'error';

export interface PreparedOutputInput {
  /** Changes whenever the output would change; null puts the hook in `idle`
   * (nothing to build). */
  key: string | null;
  /** Builds the output for the current inputs; reads them through a ref the
   * caller keeps current, so it is only ever called for the latest key. */
  build: (signal: AbortSignal, onProgress: (fraction: number) => void) => Promise<{ blob: Blob; pageCount: number }>;
  /** Turns a failed build into a reportable cause and reports it, or ignores it. */
  onBuildError?: (error: unknown) => void;
  /** Tests shorten the wait; the tools never pass it. */
  quietPolicy?: QuietPolicy;
}

export interface PreparedOutput {
  status: PreparedStatus;
  blob: Blob | null;
  url: string | null;
  /** Output pages of the blob that `url` points at, and its size. */
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

interface Built { blob: Blob; pageCount: number }

export function usePreparedOutput(input: PreparedOutputInput): PreparedOutput {
  const { key, build, onBuildError, quietPolicy } = input;
  const { url, setBlob, clear } = useObjectUrls();
  const [state, setState] = useState<{
    status: PreparedStatus; blob: Blob | null; pageCount: number; error: Error | null; generation: number;
  }>({ status: 'idle', blob: null, pageCount: 0, error: null, generation: 0 });
  const [progress, setProgress] = useState(0);
  const preparerRef = useRef<ReturnType<typeof createQuietPreparer<Built>> | null>(null);
  const keyRef = useRef<string | null>(null);
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
        setBlob(built.blob);
        setState((current) => ({ status: 'ready', blob: built.blob, pageCount: built.pageCount, error: null, generation: current.generation + 1 }));
      },
      onError: (errorKey, error) => {
        // expected: a superseded build is aborted on purpose and is not a failure
        if ((error as DOMException)?.name === 'AbortError' || errorKey !== keyRef.current) return;
        callbacksRef.current.onBuildError?.(error);
        console.error(error);
        setState((current) => ({ status: 'error', blob: null, pageCount: 0, error: error as Error, generation: current.generation }));
      },
    });
    preparerRef.current = preparer;
    return () => {
      preparer.dispose();
      preparerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const preparer = preparerRef.current;
    if (!preparer) return;
    if (key === null) {
      keyRef.current = null;
      preparer.dispose();
      setState((current) => (current.status === 'idle' && !current.blob ? current : { status: 'idle', blob: null, pageCount: 0, error: null, generation: current.generation }));
      clear();
      setProgress(0);
      return;
    }
    // Any change withdraws the previous blob at once: the Download link must
    // never hand out a result for an order the person has since changed. A
    // cache hit inside change() restores a built state in the same commit.
    keyRef.current = key;
    setState((current) => ({ status: 'pending', blob: null, pageCount: 0, error: null, generation: current.generation }));
    clear();
    setProgress(0);
    preparer.change(key);
  }, [key]);

  const prepareNow = useCallback(() => preparerRef.current?.now(), []);

  return {
    status: state.status,
    blob: state.blob,
    url,
    pageCount: state.pageCount,
    size: state.blob?.size ?? 0,
    progress,
    error: state.error,
    generation: state.generation,
    prepareNow,
  };
}
