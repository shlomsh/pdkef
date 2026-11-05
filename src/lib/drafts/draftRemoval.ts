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
import type { DraftEntry } from './draftRecords.ts';
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

function finish(ids: Set<string>, remaining: DraftEntry[], announcement: string[] | 'all') {
  writeRecentFiles(remaining);
  toolsPointingAt(ids, readCurrentPointers()).forEach(clearCurrentEntry);
  clearAllHandoffPending();
  announceRemoved(announcement);
}

async function removeFromStore(step: string, work: (store: IDBObjectStore) => void): Promise<boolean> {
  if (!hasIndexedDB()) return true;
  try {
    await ensureMigrated();
    await withStore('readwrite', work);
    return true;
  } catch (e) {
    reportStoreError('drafts', e, step);
    console.error(`draftStore.${step} failed:`, e);
    return false;
  }
}

// A hand-off holds a copy of a file's bytes and stays on disk until that tool next opens,
// however old (takeHandoff). Every one goes rather than a matched one: the promise is that
// nothing of the file stays, and matching would mean hashing bytes. The cost: a Remove in one
// tab in the moment another tab is handing a file over drops that file, to be picked again.
const handoffs = () => IDBKeyRange.bound('handoff:', 'handoff:\uffff');

/** Remove one recent entry, its work in every tool, any pointer to it and any waiting hand-off. */
export async function removeRecentEntry(id: string): Promise<boolean> {
  if (!await removeFromStore('remove_recent_entry', (store) => { store.delete(recentFileKey(id)); store.delete(handoffs()); })) return false;
  finish(new Set([id]), readIndexEntries().filter((entry) => entry.id !== id), [id]);
  return true;
}

/** Remove every recent entry. The store holds only entries, one-shot hand-offs (a copy of a
 * file's bytes, so they go too) and legacy records that migration has just folded in. */
export async function clearRecentEntries(): Promise<boolean> {
  if (!await removeFromStore('clear_recent_entries', (store) => { store.clear(); })) return false;
  const ids = new Set([...readIndexEntries().map((entry) => entry.id), ...readCurrentPointers().map(([, id]) => id)]);
  finish(ids, [], 'all');
  return true;
}
