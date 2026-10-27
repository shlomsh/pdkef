import { useRef, useEffect } from 'preact/hooks';
import type { SignMessages } from '../../../editor/registry/messages';
import { useLatestRun } from '../../../lib/useLatestRun.ts';
import type { SignedExport } from '../lib/exportHandoff.ts';
import type { SignLifecycleAction } from '../state/signState.ts';

interface ExportRunOptions {
  file: File | null;
  documentRevision: number;
  lifecycleDispatch: (action: SignLifecycleAction) => void;
  clearPrepared: () => void;
  preparedExportRef: { current: SignedExport | null };
  messages: SignMessages;
}

/**
 * Which export is still wanted: the run tracker, the refs it reads, and the two
 * effects that retire it (the editor leaving the tree, and an edit or new file).
 */
export function useExportRun({ file, documentRevision, lifecycleDispatch, clearPrepared, preparedExportRef, messages: t }: ExportRunOptions) {
  // Whether the export currently tracked by `exportRun` is a
  // background speculative one (MOBI-07) rather than a real, user-initiated
  // one. The invalidation effect below reads this to decide whether getting
  // superseded is user-visible news or routine background churn.
  const activeExportSpeculativeRef = useRef(false);
  const documentRevisionRef = useRef(documentRevision);
  documentRevisionRef.current = documentRevision;
  // An export is only wanted while the file and revision it started from are still on screen.
  const exportRun = useLatestRun(() => [file, documentRevisionRef.current]);

  // pdf.js owns worker and document resources outside Preact. Release the
  // active one when the editor leaves the tree, rather than letting a late
  // loading/render completion write into an unmounted workspace.
  useEffect(() => () => {
    exportRun.invalidate();
  }, []);

  // A prepared export is only valid for the current annotation state. An edit
  // also revokes a PDF currently being generated: its completion must not make
  // an older version available for download or sharing.
  useEffect(() => {
    clearPrepared();
    preparedExportRef.current = null;
    lifecycleDispatch({ type: 'EXPORT_RETIRED' });
    // Retires the export in flight (if any) and says whether one was live.
    const wasLive = exportRun.invalidate();
    if (!wasLive) return;
    // A speculative background export getting superseded by a further edit is
    // routine (MOBI-07) - it never surfaced as "preparing" in the first place,
    // so silently discarding it (runExport's own guards handle that) is
    // correct. Only a real, user-initiated export in flight is worth telling
    // the user their edit invalidated it.
    if (activeExportSpeculativeRef.current) return;
    lifecycleDispatch({ type: 'EXPORT_INTERRUPTED', announcement: t.editsChangedWhilePreparing });
  }, [file, documentRevision, clearPrepared, exportRun]);

  return { exportRun, activeExportSpeculativeRef, documentRevisionRef };
}
