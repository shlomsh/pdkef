import { useRef } from 'preact/hooks';
import { mergePdfs, MergeFileError } from '../merge.js';
import { reportableCause } from '../reportableCause.ts';
import { toMergeMap } from '../mergePlan.ts';
import { outputPageCount, type PlanEntry } from '../../../lib/pagePlan.ts';
import { reportError } from '../../../lib/errorReport.ts';
import { type QuietPolicy } from '../../../lib/quietPrepare.ts';
import { usePreparedOutput, type PreparedOutput, type PreparedStatus } from '../../../lib/usePreparedOutput.ts';

/* The quiet-background build lives in src/lib/usePreparedOutput.ts; this is
   the merge half: when the set is mergeable, what its state key is, and how
   a merge is built and its failures reported. */

export type { PreparedStatus };

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

export type PreparedMerge = Omit<PreparedOutput, 'error'> & { error: MergeFileError | Error | null };

// Pure decision helper, exported for the unit tests: the input is mergeable
// when every file is present and there is at least one output page.
export function isMergeable(input: Pick<PreparedMergeInput, 'files' | 'plan'>): boolean {
  return !!input.files && input.files.length >= 2 && outputPageCount(input.plan) > 0;
}

export function usePreparedMerge(input: PreparedMergeInput): PreparedMerge {
  const { files, plan, fileIds, addPageNumbers, title, quietPolicy } = input;
  /** What the next build reads; always the inputs of the current key. */
  const inputsRef = useRef({ files, plan, fileIds, addPageNumbers, title });
  inputsRef.current = { files, plan, fileIds, addPageNumbers, title };

  // `fileIds` and `files` are rebuilt by the caller only when the set really
  // changes (see PdfMergeTool's useMemo), so they are stable across renders
  // that change nothing.
  const planKey = plan.map((e) => `${e.fileId}.${e.pageIndex}.${e.rotation}.${e.skipped ? 1 : 0}`).join(',');
  const key = isMergeable({ files, plan })
    ? `${fileIds.join(',')}|${planKey}|${addPageNumbers ? 1 : 0}|${title}`
    : null;

  return usePreparedOutput({
    key,
    quietPolicy,
    build: async (signal, onProgress) => {
      const { files: sourceFiles, plan: p, fileIds: ids, addPageNumbers: numbers, title: t } = inputsRef.current;
      const blob = await mergePdfs(
        sourceFiles as File[],
        { plan: toMergeMap(p, ids), addPageNumbers: numbers, title: t },
        onProgress,
        signal,
      );
      return { blob, pageCount: outputPageCount(p) };
    },
    onBuildError: (error) => {
      const cause = reportableCause(error);
      if (cause) reportError('pdf_tool_run', cause, 'build_merge');
    },
  });
}
