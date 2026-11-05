import { useEffect, useState } from 'preact/hooks';
import { clearRecentEntries, readRecentFiles, removeRecentEntry } from '#lib/drafts/draftStore.ts';
import type { RecentFileItem } from './RecentFiles.tsx';

/* MEM-03: every entry in the recency index - Sign/Redact source PDFs and a
   Merge file set alike - is an ordinary row now that work lives on the entry
   rather than in a separate per-tool draft slot (draftStore.ts's one memory
   space). There is no longer a Merge-only row to read separately and dedupe
   against this list. readRecentFiles() already caps at six itself; the slice
   here is the same belt-and-suspenders this always had, not new capping
   logic. */
function readHomeRecents(): RecentFileItem[] {
  return readRecentFiles().map((entry: any) => ({ ...entry, cacheId: entry.id })).slice(0, 6);
}

/**
 * The home page's recents: null until mounted (see the note on this state in
 * FileDropzone.tsx), kept current across tabs and back/forward restores, and
 * MEM-30's two ways of removing them. The store resolves false rather than
 * throwing, so `settled` hears every outcome.
 */
export function useHomeRecents(settled: (ok: boolean) => void) {
  const [recents, setRecents] = useState<RecentFileItem[] | null>(null);
  useEffect(() => {
    const refresh = () => setRecents(readHomeRecents());
    refresh();
    window.addEventListener('pageshow', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('pageshow', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const finish = (ok: boolean) => {
    if (ok) setRecents(readHomeRecents());
    settled(ok);
  };
  return {
    recents,
    removeRecent: (file: RecentFileItem) => { if (file.cacheId) void removeRecentEntry(file.cacheId).then(finish); }, // reason: the store resolves false instead of rejecting
    clearRecents: () => { void clearRecentEntries().then(finish); }, // reason: same as above
  };
}
