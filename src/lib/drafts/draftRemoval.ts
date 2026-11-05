// MEM-30: a person removing a recent file themselves. Expiry (28 days) and
// eviction (six entries) are the other two ways an entry leaves; this is the
// third, and the only one the person chooses. The store step runs first and
// is all-or-nothing: if it throws, the index, pointers and signals stay as
// they were. Nothing here reads a record, so no PDF bytes are loaded.
//
// What a file leaves behind is the entry (bytes, and every tool's work, the
// per-document style and marker included), its index row (name, preview), the
// pointers, and any hand-off. Saved signatures and app-wide defaults belong to the
// person, not to a file, and stay. e2e/home/recent-tile-remove.spec.js checks
// that no browser storage still names the file; new per-file storage goes here.
// A tab with the file open is draftRemovalWatch.ts's part.
import { hasIndexedDB, reportStoreError, withStore } from './draftIdb.ts';
import { announceRemoved } from './draftRemovalWatch.ts';
import { clearCurrentEntry, readCurrentPointers, readIndexEntries, recentFileKey, writeRecentFiles } from './draftRecentIndex.ts';
import { ensureMigrated } from './draftMigration.ts';
import { clearAllHandoffPending } from '../handoff/handoffPending.ts';

/**
 * The tools whose current-entry pointer is one of `ids`.
 * @testSeam
 */
export function toolsPointingAt(ids: Set<string>, pointers: [string, string][]): string[] {
  return pointers.filter(([, id]) => ids.has(id)).map(([tool]) => tool);
}

// A hand-off holds a copy of a file's bytes and stays on disk until that tool next opens,
// however old (takeHandoff). Every one goes rather than a matched one: the promise is that
// nothing of the file stays, and matching would mean hashing bytes. The cost: a Remove in one
// tab in the moment another tab is handing a file over drops that file, to be picked again.
const handoffs = () => IDBKeyRange.bound('handoff:', 'handoff:\uffff');

/** Remove one recent entry, its work in every tool, any pointer to it and any waiting hand-off. */
export async function removeRecentEntry(id: string): Promise<boolean> {
  if (hasIndexedDB()) {
    try {
      await ensureMigrated();
      await withStore('readwrite', (store) => { store.delete(recentFileKey(id)); store.delete(handoffs()); });
    } catch (e) {
      reportStoreError('drafts', e, 'remove_recent_entry');
      console.error('draftStore.remove_recent_entry failed:', e);
      return false;
    }
  }
  writeRecentFiles(readIndexEntries().filter((entry) => entry.id !== id));
  toolsPointingAt(new Set([id]), readCurrentPointers()).forEach(clearCurrentEntry);
  clearAllHandoffPending();
  announceRemoved([id]);
  return true;
}
