import { useEffect, useRef, useState } from 'preact/hooks';
import { clearCurrentEntry, hasDraftHint, loadDraft } from '#lib/drafts/draftStore.ts';
import { useDraftRestore, useDraftSave } from '#lib/drafts/useDraftLifecycle.ts';
import { markArrival } from '#lib/handoff/fileArrival.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { englishShellMessages as sm } from '#shell/shellMessages.ts';
import { parseScanDraft, SCAN_DRAFT_TOOL as TOOL, type ScanDraftRestore, type ScanDraftSettings } from '../lib/scanDraft.ts';
import { recentPreview } from '../lib/recentPreview.ts';
import { resultKey } from '../lib/scanPages.ts';
import { ScanDraftSession } from '../state/scanDraftSession.ts';
import type { PageResult, ScanPage, ScanWork } from '../state/scanWork.ts';

type SaveState = 'idle' | 'pending' | 'saved' | 'error';

interface ScanDraftInput {
  pages: ScanPage[];
  results: Record<number, PageResult>;
  settings: Omit<ScanDraftSettings, 'name'> & {
    customName: string | null;
    defaultName: string;
    restoreSettings: (saved: Partial<ScanDraftSettings>) => void;
  };
  restorePages: (restore: ScanDraftRestore) => ScanPage[];
  work: ScanWork;
}

/** The quiet draft line: saving, saved, or not saved; nothing before the first change. */
function statusLine(state: SaveState) {
  return state === 'saved' ? { label: sm.draftSaved, failed: false }
    : state === 'pending' ? { label: sm.draftSaving, failed: false }
      : state === 'error' ? { label: sm.draftNotSaved, failed: true }
        : null;
}

/** Page 1's processed thumbnail becomes the scan's picture on its Recents tile. */
function useRecentPreview(session: ScanDraftSession, pages: ScanPage[], results: Record<number, PageResult>) {
  const first = pages[0];
  const firstResult = first ? results[first.id] : undefined;
  const thumb = first && firstResult && firstResult.key === resultKey(first) ? firstResult.page.thumb : null;
  useEffect(() => {
    if (!thumb) return undefined;
    let cancelled = false;
    recentPreview(thumb).then((url) => {
      if (cancelled || !url) return;
      session.preview = url;
      // Already saved: the tile gets it now. Otherwise the save carries it, or attaches it once it lands.
      session.attachPreview();
    }, (err) => {
      // A missing thumbnail costs the tile its picture, never the scan.
      reportError('drafts', err, 'scan_recent_preview');
    });
    return () => { cancelled = true; };
  }, [thumb]);
}

/**
 * SCAN-18: the scan in progress lives in the shared on-device memory space (draftStore.ts), like Merge's file
 * list and the editors' documents, so a crash, a closed tab or a closed browser loses nothing and the scan is a
 * tile in the home page's Recents. What a session knows about its entry is state/scanDraftSession.ts.
 *
 * Continuous debounced autosave is what survives a crash (a crashing tab fires no unload event); the
 * core's `pagehide`/`visibilitychange` flush only catches a clean close up.
 */
export function useScanDraft({ pages, results, settings, restorePages, work }: ScanDraftInput) {
  const sessionRef = useRef<ScanDraftSession | null>(null);
  sessionRef.current ??= new ScanDraftSession();
  const session = sessionRef.current;
  const { pageSize, limit, defaultFilter } = settings;
  // The name the PDF downloads under, as shown (useScanExport's outputName).
  const chosen: ScanDraftSettings = { pageSize, limit, defaultFilter, name: settings.customName ?? settings.defaultName };
  const key = session.keyOf(pages, chosen);
  const latest = useRef({ pages, chosen, key, settings, restorePages });
  latest.current = { pages, chosen, key, settings, restorePages };

  const [hinted] = useState(() => hasDraftHint(TOOL));

  // Restore once, on mount. The hint only spares a visitor with nothing saved the "checking" state; the
  // IndexedDB entry is the truth, so the read runs either way. The hint goes once the check settles,
  // restored or not: a restored scan can be cleared, and the empty state must then show (Dropzone.module.css).
  const restore = useDraftRestore({
    tool: TOOL,
    clearHint: 'settled',
    errorStep: 'restore_scan_draft',
    async run(source, isCancelled) {
      // Photos handed over from Image to PDF are a new scan: they must not join the remembered one.
      if (document.documentElement.hasAttribute('data-handoff-pending')) return true;
      const record = await loadDraft(TOOL);
      if (isCancelled()) return true;
      const restored = parseScanDraft(record);
      // A pointer at an entry with no photos cannot be a scan: let it go.
      if (record && !restored) clearCurrentEntry(TOOL);
      // Pages already here (a pick while the check ran) are the newer intent and win.
      if (record && restored && work.pages.length === 0) {
        markArrival(source);
        latest.current.settings.restoreSettings(restored.settings);
        const pagesBack = latest.current.restorePages(restored);
        session.restored(record.sourceId, pagesBack, { ...latest.current.chosen, ...restored.settings });
      }
      return true;
    },
  });
  const checking = hinted && restore.checking;

  // Saving waits for the restore check to settle, so a remembered scan is never superseded by an empty start.
  const save = useDraftSave({
    tool: TOOL,
    snapshot: [key],
    canSave: key !== null && restore.settled,
    build: () => {
      const { pages: snapshot, chosen: now, key: snapshotKey } = latest.current;
      return snapshotKey === null ? null : { pages: snapshot, settings: now, key: snapshotKey };
    },
    // session.save reports its own failure and resolves false; the core only reports a throw.
    write: (snapshot) => session.save(snapshot),
    errorStep: 'save_scan_draft',
    // A forget (Clear all) queues its delete on the session's chain, outside write.
    drain: () => session.settled(),
  });

  // A restored scan is what the store already holds: nothing to write until a stored field changes.
  useEffect(() => {
    if (key !== null && key === session.savedKey) save.markSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Clear all, or the last page removed: the scan is over and its work is forgotten.
  const hadPagesRef = useRef(false);
  useEffect(() => {
    if (hadPagesRef.current && key === null) {
      session.forget();
    }
    hadPagesRef.current = key !== null;
  }, [key]);

  useRecentPreview(session, pages, results);

  // A restored scan reads idle from its first render, before the effect above marks it saved.
  const stored = key !== null && key === session.savedKey;
  const state: SaveState = key === null || save.state === 'conflict' || (stored && save.state === 'pending') ? 'idle' : save.state;

  return { checking, status: statusLine(state) };
}
