import { useCallback } from 'preact/hooks';
import type { Dispatch } from 'preact/hooks';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { rememberOptions } from '../components/rememberedOptions.ts';
import type { MergeAction, MergeState } from '../state/mergeState.ts';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Options {
  dispatch: Dispatch<MergeAction>;
  canReorderFiles: boolean;
  moveFileEntry: (id: number, delta: number) => void;
  documentRef: { current: HTMLElement | null };
}

/** The island's small event handlers, each a stable callback over `dispatch`. */
export function useMergeHandlers({ dispatch, canReorderFiles, moveFileEntry, documentRef }: Options) {
  const onRowKeyDown = useCallback(
    (event: KeyboardEvent, id: number) => {
      if (!canReorderFiles) return;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveFileEntry(id, -1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveFileEntry(id, 1);
      }
    },
    [moveFileEntry, canReorderFiles],
  );

  // Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z are bound by useDocumentHistory, which stands down while
  // focus is in an input (the page-numbers checkbox, the rename field). The prepared output
  // follows the plan on its own (usePreparedMerge keys on it), so nothing is cleared here.

  const onPageNumbersChange = useCallback((event: Event) => {
    const next = (event.target as HTMLInputElement).checked;
    dispatch({ type: 'PAGE_NUMBERS_CHANGED', value: next });
    rememberOptions({ addPageNumbers: next });
    recordAction('change_setting');
  }, [dispatch]);

  // MERGE-11: the rename itself lives in the shell's OutputName. '' means the
  // person emptied it, which goes back to the automatic name.
  const renameOutput = useCallback((next: string) => {
    dispatch({ type: 'OUTPUT_RENAMED', name: next.length > 0 ? next : null });
  }, [dispatch]);
  const onDraftStateChange = useCallback(
    (next: { isRestoring: boolean; draftSaveState: MergeState['draftSaveState'] }) => dispatch({ type: 'DRAFT_CHECK_SETTLED', ...next }),
    [dispatch],
  );
  const onRenderedCountChange = useCallback((count: number) => dispatch({ type: 'RENDERED_COUNT_CHANGED', count }), [dispatch]);

  const scrollToCaption = useCallback((fileId: number) => {
    const container = documentRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-caption-for="${fileId}"]`)
      ?? container?.querySelector<HTMLElement>(`[data-key^="${fileId}:"]`);
    target?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [documentRef]);

  return { onRowKeyDown, onPageNumbersChange, renameOutput, onDraftStateChange, onRenderedCountChange, scrollToCaption };
}
