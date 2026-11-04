import { useEffect, useRef, useState } from 'preact/hooks';
import { clearCurrentEntry, hasDraftHint, loadDraft } from '#lib/drafts/draftStore.ts';
import { clearDraftHintAttribute, RESTORE_TIMEOUT_MS } from '#lib/drafts/useDraftPersistence.js';
import { registerBeforeUpdateReload } from '#lib/appUpdate/updateHolds.ts';
import { useHoldUpdate } from '#lib/hooks/useHoldUpdate.ts';
import { consumeRecentOpen, markArrival } from '#lib/handoff/fileArrival.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { englishShellMessages as sm } from '#shell/shellMessages.ts';
import { parseScanDraft, SCAN_DRAFT_TOOL as TOOL, type ScanDraftRestore, type ScanDraftSettings } from '../lib/scanDraft.ts';
import { recentPreview } from '../lib/recentPreview.ts';
import { resultKey } from '../lib/scanPages.ts';
import { ScanDraftSession } from '../state/scanDraftSession.ts';
import type { PageResult, ScanPage, ScanWork } from '../state/scanWork.ts';

/** Same window as Merge and the editors: long enough to batch a run of changes, short enough for a crash. */
const SCAN_AUTOSAVE_DEBOUNCE_MS = 700;

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
 * `pagehide`/`visibilitychange` flush only catches a clean close up.
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

  const [status, setStatus] = useState<{ key: string | null; state: SaveState }>({ key: null, state: 'idle' });
  // Saving waits for the restore check to settle, so a remembered scan is never superseded by an empty start.
  const [checked, setChecked] = useState(false);
  const [hinted] = useState(() => hasDraftHint(TOOL));
  const checkedRef = useRef(false);

  const save = (): Promise<boolean> => {
    const { pages: snapshot, chosen: now, key: snapshotKey } = latest.current;
    if (snapshotKey === null || !checkedRef.current || snapshotKey === session.savedKey) return Promise.resolve(true);
    return session.save({ pages: snapshot, settings: now, key: snapshotKey }).then((saved) => {
      if (snapshotKey === latest.current.key) setStatus({ key: snapshotKey, state: saved ? 'saved' : 'error' });
      return saved;
    });
  };

  // Restore once, on mount. The hint only spares a visitor with nothing saved the "checking" state; the
  // IndexedDB entry is the truth, so the read runs either way.
  useEffect(() => {
    let cancelled = false;
    const settle = () => {
      if (cancelled) return;
      checkedRef.current = true;
      setChecked(true);
    };
    // Photos handed over from Image to PDF are a new scan: they must not join the remembered one.
    if (document.documentElement.hasAttribute('data-handoff-pending')) {
      settle();
      return () => { cancelled = true; };
    }
    const timeoutId = setTimeout(settle, RESTORE_TIMEOUT_MS);
    const source = consumeRecentOpen(TOOL) ? 'recent' : 'restore';
    loadDraft(TOOL).then((record) => {
      if (cancelled) return;
      clearTimeout(timeoutId);
      const restore = parseScanDraft(record);
      // A pointer at an entry with no photos cannot be a scan: let it go.
      if (record && !restore) clearCurrentEntry(TOOL);
      // Pages already here (a pick while the check ran) are the newer intent and win.
      if (record && restore && work.pages.length === 0) {
        markArrival(source);
        latest.current.settings.restoreSettings(restore.settings);
        const restored = latest.current.restorePages(restore);
        session.restored(record.sourceId, restored, { ...latest.current.chosen, ...restore.settings });
      }
      settle();
    }).catch((err) => {
      reportError('drafts', err, 'restore_scan_draft');
      settle();
    });
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The pre-paint hint (ToolPageLayout.astro) hides the empty state while a restore may land. Once the check
  // has settled it goes, restored or not: a restored scan can be cleared, and the empty state must then show
  // (Dropzone.module.css; Merge's useRestoreSettling learned the same).
  useEffect(() => {
    if (checked) clearDraftHintAttribute();
  }, [checked]);

  // Debounced autosave whenever a stored field changes.
  useEffect(() => {
    if (key === null || !checked || key === session.savedKey) return undefined;
    const timer = setTimeout(() => void save(), SCAN_AUTOSAVE_DEBOUNCE_MS); // reason: save never rejects
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, checked]);

  // Catch-up for a clean close, and for an update reload (MEM-10), which must not outrun the write.
  useEffect(() => {
    const flush = () => void save(); // reason: save never rejects
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    const unregister = registerBeforeUpdateReload(async () => {
      await save();
      await session.settled();
    });
    return () => {
      unregister();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear all, or the last page removed: the scan is over and its work is forgotten.
  const hadPagesRef = useRef(false);
  useEffect(() => {
    if (hadPagesRef.current && key === null) {
      session.forget();
      setStatus({ key: null, state: 'idle' });
    }
    hadPagesRef.current = key !== null;
  }, [key]);

  useRecentPreview(session, pages, results);

  const state: SaveState = key === null ? 'idle'
    : status.key === key ? status.state
      : key === session.savedKey ? 'idle'
        : 'pending';
  // A scan whose save failed lives only in memory: an update must not reload it away (MEM-10).
  useHoldUpdate(state === 'error', 'open');

  return { checking: hinted && !checked, status: statusLine(state) };
}
