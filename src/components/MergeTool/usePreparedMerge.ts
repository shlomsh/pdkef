import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { mergePdfs, MergeFileError } from '../../lib/merge.js';
import { outputPageCount, toMergeMap, type PlanEntry } from '../../lib/mergePlan.ts';
import { useObjectUrls } from '../../lib/useObjectUrls.js';

/* MERGE-12: pre-merge on idle so Download is one tap.

   Upload-based tools need an explicit Merge step because the work happens
   somewhere else. Here it happens on the device, and pdf-lib copies pages in
   tens of milliseconds for a typical set, so the step goes: after the last
   change to the list or the pages, wait this long for the person to stop
   changing things, then build the merged blob in the background. Any further
   change cancels the running merge (AbortController) and restarts the wait.
   The number is a guess at "finished fiddling" - long enough that dragging a
   file two rows does not build a blob per row, short enough that Download is
   ready before a hand reaches it. */
export const PREPARE_DEBOUNCE_MS = 600;

export type PreparedStatus = 'idle' | 'preparing' | 'ready' | 'error';

export interface PreparedMergeInput {
  /** The files in list order; `null` while a set is not mergeable yet
   * (fewer than two files, a page count still being read, a file that
   * cannot take part). Passing null puts the hook in `idle`. */
  files: File[] | null;
  plan: PlanEntry[];
  fileIds: number[];
  addPageNumbers: boolean;
  title: string;
  /** Tests shorten the wait; the tool never passes it. */
  debounceMs?: number;
}

export interface PreparedMerge {
  status: PreparedStatus;
  blob: Blob | null;
  url: string | null;
  /** Output pages of the blob that `url` points at, and its size. */
  pageCount: number;
  size: number;
  /** 0..1 while preparing, per source file. */
  progress: number;
  error: MergeFileError | Error | null;
  /** Bumps whenever a new blob becomes ready, so a caller waiting for "the
   * result of the tap I just made" can tell a fresh blob from the old one. */
  generation: number;
}

// Pure decision helper, exported for the unit tests: the input is mergeable
// when every file is present and there is at least one output page.
export function isMergeable(input: Pick<PreparedMergeInput, 'files' | 'plan'>): boolean {
  return !!input.files && input.files.length >= 2 && outputPageCount(input.plan) > 0;
}

export function usePreparedMerge(input: PreparedMergeInput): PreparedMerge {
  const { files, plan, fileIds, addPageNumbers, title, debounceMs = PREPARE_DEBOUNCE_MS } = input;
  const { url, setBlob, clear } = useObjectUrls();
  const [state, setState] = useState<{
    status: PreparedStatus; blob: Blob | null; pageCount: number; error: PreparedMerge['error']; generation: number;
  }>({ status: 'idle', blob: null, pageCount: 0, error: null, generation: 0 });
  const [progress, setProgress] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  const cancelRunning = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => {
    cancelRunning();
    if (!isMergeable({ files, plan })) {
      setState((current) => (current.status === 'idle' && !current.blob ? current : { status: 'idle', blob: null, pageCount: 0, error: null, generation: current.generation }));
      clear();
      setProgress(0);
      return undefined;
    }
    const sourceFiles = files as File[];
    // Any change invalidates the previous blob at once: the Download link
    // must never hand out a result for an order the person has since changed.
    setState((current) => ({ status: 'preparing', blob: null, pageCount: 0, error: null, generation: current.generation }));
    clear();
    setProgress(0);

    const controller = new AbortController();
    controllerRef.current = controller;
    const timer = setTimeout(async () => {
      try {
        const map = toMergeMap(plan, fileIds);
        const blob = await mergePdfs(
          sourceFiles,
          { plan: map, addPageNumbers, title },
          (fraction: number) => { if (!controller.signal.aborted) setProgress(fraction); },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setBlob(blob);
        setState((current) => ({ status: 'ready', blob, pageCount: outputPageCount(plan), error: null, generation: current.generation + 1 }));
      } catch (error) {
        if (controller.signal.aborted || (error as DOMException)?.name === 'AbortError') return;
        console.error(error);
        setState((current) => ({ status: 'error', blob: null, pageCount: 0, error: error as Error, generation: current.generation }));
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `fileIds` and `files` are rebuilt by the caller only when the set really
    // changes (see PdfMergeTool's useMemo), so they are stable across renders
    // that change nothing.
  }, [files, plan, fileIds, addPageNumbers, title, debounceMs]);

  return {
    status: state.status,
    blob: state.blob,
    url,
    pageCount: state.pageCount,
    size: state.blob?.size ?? 0,
    progress,
    error: state.error,
    generation: state.generation,
  };
}
