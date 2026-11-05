import { reqToPromise, withStore } from './draftIdb.ts';
import { recentFileKey } from './draftRecentIndex.ts';

// MEM-30: what keeps a removed file removed while a tab still has it open. Every
// save would otherwise write it back ("the next local save wins" is right between
// two tabs editing, wrong after a person has said the file is gone). The store sees
// every load and save, so it knows the entry this tab is on, for every tool at once:
// when that entry is removed, saves of it are refused here (a reload's own pagehide
// flush included) and the tab reloads into the tool's ordinary empty state.

/** A message, not a record: written and deleted at once, since a peer's storage event still
 * carries the value and a removed file's id must not stay on the device.
 * @testSeam */
export const ENTRIES_REMOVED_KEY = 'pdf-toolkit:workspace:entries-removed';

let tabEntry: string | null = null;
const refused = new Set<string>();
let watching = false;

function leave(id: string) {
  refused.add(id);
  tabEntry = null;
  location.reload();
}

function heard(event: StorageEvent) {
  if (event.key !== ENTRIES_REMOVED_KEY || !event.newValue || !tabEntry) return;
  try {
    const { removed } = JSON.parse(event.newValue);
    if (removed === 'all' || (Array.isArray(removed) && removed.includes(tabEntry))) leave(tabEntry);
  } catch {
    // expected: a corrupt message says nothing; the store stays authoritative.
  }
}

// A frozen page hears nothing, and tool, home, Remove, Back is the likeliest way to reach one.
async function restored(event: PageTransitionEvent) {
  const id = tabEntry;
  if (!event.persisted || !id) return;
  try {
    const key = await withStore('readonly', (store) => reqToPromise(store.getKey(recentFileKey(id))));
    if (key === undefined && tabEntry === id) leave(id);
  } catch {
    // expected: an unreadable store is no evidence the entry went; the document stays open.
  }
}

/** This tab is now on entry `id`, the one a later removal is checked against, or on
 * nothing stored (null): noted before a write, so a failed write still moves the tab on. */
export function noteTabEntry(id: string | null) {
  tabEntry = id;
  if (watching || typeof window === 'undefined') return;
  watching = true;
  window.addEventListener('storage', heard);
  window.addEventListener('pageshow', restored);
}

/** Whether this tab was told `id` is gone, so nothing here may write it again. */
export const wasRemoved = (id: string) => refused.has(id);

/** Tell every other tab which entries are gone. */
export function announceRemoved(removed: string[] | 'all') {
  try {
    localStorage.setItem(ENTRIES_REMOVED_KEY, JSON.stringify({ removed }));
    localStorage.removeItem(ENTRIES_REMOVED_KEY);
  } catch {
    // expected: blocked storage; a tab that misses this can only write the file back by being edited.
  }
}

/** @testSeam */
export function forgetTabEntry() {
  tabEntry = null;
  refused.clear();
}
