import { useEffect, useState } from 'preact/hooks';
import type { Dispatch } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { reportError } from '../../../lib/telemetry/errorReport.ts';
import type { PageGridProps } from '../../../shell/pageGrid/PageGrid.tsx';
import type { MergeDraftPersistenceProps } from '../components/MergeDraftPersistence.tsx';
import type { MergeAction, MergeStatus } from '../state/mergeState.ts';

interface SettleOptions {
  hasFiles: boolean;
  status: MergeStatus;
  workspaceReady: boolean;
  /** Set by a draft restore; consumed once the restored grid is in the document. */
  restoreScrollPendingRef: { current: boolean };
}

/**
 * MERGE-08 / MERGE-13: the grid and the draft hook arrive through dynamic
 * import(), so the eager graph check-page-weight.js measures for /merge/ does
 * not grow with them.
 */
export function useLazySurfaces(hasFiles: boolean, dispatch: Dispatch<MergeAction>) {
  const [PageGrid, setPageGrid] = useState<ComponentType<PageGridProps> | null>(null);
  const [DraftPersistence, setDraftPersistence] = useState<ComponentType<MergeDraftPersistenceProps> | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('../components/MergeDraftPersistence.tsx')
      .then((module) => { if (!cancelled) setDraftPersistence(() => module.default); })
      .catch((err) => { reportError('chunk_load', err, 'import_draft_persistence'); if (!cancelled) dispatch({ type: 'DRAFT_MODULE_FAILED' }); });
    return () => { cancelled = true; };
  }, [dispatch]);

  useEffect(() => {
    if (!hasFiles || PageGrid) return;
    let cancelled = false;
    import('../../../shell/pageGrid/PageGrid.tsx')
      .then((module) => { if (!cancelled) setPageGrid(() => module.default); })
      .catch((err) => { reportError('chunk_load', err, 'import_page_strip'); });
    return () => { cancelled = true; };
  }, [hasFiles, PageGrid]);

  return { PageGrid, DraftPersistence };
}

/**
 * The page-level effects that depend on a restore having settled: the
 * pre-paint markers and the scroll offset.
 */
export function useRestoreSettling({ hasFiles, status, workspaceReady, restoreScrollPendingRef }: SettleOptions) {
  // ToolPageLayout's pre-paint script sets `html[data-draft-hint]` when a
  // draft exists, and Dropzone.module.css hides the empty-state dropzone under
  // it until hydration commits its real state. Sign never shows an empty state
  // after a restore (Replace loads another file), so its hook only clears the
  // attribute when nothing was restored; Merge does show one again, after
  // Clear all or Start again, so the attribute goes as soon as the check has
  // settled either way. Without this the card came back blank after Clear all.
  useEffect(() => {
    if (status === 'checking-draft') return;
    document.documentElement.removeAttribute('data-draft-hint');
    // A Merge restore holds the temporary shell and static content below it
    // invisible until PageGrid has mounted the real grid. Do not clear its
    // pre-paint marker as soon as IndexedDB returns: the restored files still
    // need to make it through inspection and this dynamically-loaded surface.
    // A missing/stale draft has no files, so it is released immediately.
    if (!hasFiles || workspaceReady) document.documentElement.removeAttribute('data-merge-restore');
  }, [status, hasFiles, workspaceReady]);

  // WebKit intermittently ignores history.scrollRestoration during a reload.
  // Wait until the asynchronously restored grid is really in the document,
  // then reset the stale offset once for that restore. The second pass lands
  // after the restore marker above reveals the completed workspace.
  useEffect(() => {
    if (!workspaceReady || !restoreScrollPendingRef.current) return undefined;
    restoreScrollPendingRef.current = false;
    window.scrollTo(0, 0);
    const frame = requestAnimationFrame(() => window.scrollTo(0, 0));
    return () => cancelAnimationFrame(frame);
  }, [workspaceReady]);

  // A reload with files loaded (the draft brings them back) would put the
  // page back at its old offset, measured against a layout the restore then
  // grows by a whole document; the browser keeps retrying that offset as the
  // page grows. Measured at 375px it landed below the grid, where nothing was
  // near enough to render, and the merge looked like it had no thumbnails.
  // Set the mode while files are on the page, ahead of any reload. WebKit
  // does not apply it reliably, so a restored workspace also resets the
  // stale offset once its async grid has mounted (the effect above).
  useEffect(() => {
    if (typeof history === 'undefined' || !('scrollRestoration' in history)) return;
    history.scrollRestoration = hasFiles ? 'manual' : 'auto';
  }, [hasFiles]);
}
