import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { mergePdfs, MergeFileError } from '../merge.js';
import { reportableCause } from '../reportableCause.ts';
import { outputPageCount, toMergeMap, type PlanEntry } from '../mergePlan.ts';
import { useObjectUrls } from '../../../lib/useObjectUrls.js';
import { reportError } from '../../../lib/errorReport.ts';
import { createQuietPreparer, type QuietPolicy } from '../../../lib/quietPrepare.ts';

/* Guideline §2, "Quiet means quiet": the merged blob is built in the
   background once the person has gone quiet (src/lib/quietPrepare.ts decides
   how long), and nothing on screen changes while that happens. `pending`
   covers both the quiet wait and the build itself; the tool shows 'preparing'
   only if the person taps before the blob lands. Built blobs are cached by
   state key, so an undo back to a built state is ready with no build. */

export type PreparedStatus = 'idle' | 'pending' | 'ready' | 'error';

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
  quietPolicy?: QuietPolicy;
}

export interface PreparedMerge {
  status: PreparedStatus;
  blob: Blob | null;
  url: string | null;
  /** Output pages of the blob that `url` points at, and its size. */
  pageCount: number;
  size: number;
  /** 0..1 while building, per source file. */
  progress: number;
  error: MergeFileError | Error | null;
  /** Bumps whenever a blob becomes ready, so a caller waiting for "the
   * result of the tap I just made" can tell a fresh blob from the old one. */
  generation: number;
  /** Start the build now instead of waiting for quiet (hover, focus, tap). */
  prepareNow: () => void;
}

interface Built { blob: Blob; pageCount: number }

// Pure decision helper, exported for the unit tests: the input is mergeable
// when every file is present and there is at least one output page.
export function isMergeable(input: Pick<PreparedMergeInput, 'files' | 'plan'>): boolean {
  return !!input.files && input.files.length >= 2 && outputPageCount(input.plan) > 0;
}

export function usePreparedMerge(input: PreparedMergeInput): PreparedMerge {
  const { files, plan, fileIds, addPageNumbers, title, quietPolicy } = input;
  const { url, setBlob, clear } = useObjectUrls();
  const [state, setState] = useState<{
    status: PreparedStatus; blob: Blob | null; pageCount: number; error: PreparedMerge['error']; generation: number;
  }>({ status: 'idle', blob: null, pageCount: 0, error: null, generation: 0 });
  const [progress, setProgress] = useState(0);
  const preparerRef = useRef<ReturnType<typeof createQuietPreparer<Built>> | null>(null);
  const keyRef = useRef<string | null>(null);
  /** What the next build reads; always the inputs of the current key. */
  const inputsRef = useRef({ files, plan, fileIds, addPageNumbers, title });
  inputsRef.current = { files, plan, fileIds, addPageNumbers, title };

  useEffect(() => {
    const preparer = createQuietPreparer<Built>({
      policy: quietPolicy,
      build: async (_key, signal) => {
        const { files: sourceFiles, plan: p, fileIds: ids, addPageNumbers: numbers, title: t } = inputsRef.current;
        setProgress(0);
        const blob = await mergePdfs(
          sourceFiles as File[],
          { plan: toMergeMap(p, ids), addPageNumbers: numbers, title: t },
          (fraction: number) => { if (!signal.aborted) setProgress(fraction); },
          signal,
        );
        return { blob, pageCount: outputPageCount(p) };
      },
      onReady: (key, built) => {
        if (key !== keyRef.current) return;
        setBlob(built.blob);
        setState((current) => ({ status: 'ready', blob: built.blob, pageCount: built.pageCount, error: null, generation: current.generation + 1 }));
      },
      onError: (key, error) => {
        // expected: a superseded build is aborted on purpose and is not a failure
        if ((error as DOMException)?.name === 'AbortError' || key !== keyRef.current) return;
        const cause = reportableCause(error);
        if (cause) reportError('pdf_tool_run', cause, 'build_merge');
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

  // `fileIds` and `files` are rebuilt by the caller only when the set really
  // changes (see PdfMergeTool's useMemo), so they are stable across renders
  // that change nothing.
  const planKey = plan.map((e) => `${e.fileId}.${e.pageIndex}.${e.rotation}.${e.skipped ? 1 : 0}`).join(',');
  const key = `${fileIds.join(',')}|${planKey}|${addPageNumbers ? 1 : 0}|${title}`;
  const mergeable = isMergeable({ files, plan });

  useEffect(() => {
    const preparer = preparerRef.current;
    if (!preparer) return;
    if (!mergeable) {
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
  }, [key, mergeable]);

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
