export type DraftChange = { kind: 'saved' | 'deleted'; revision: number; updatedAt: number; writerId: string };

// This tiny localStorage record is deliberately metadata only. It lets a
// second tab say what happened without ever copying a filename, PDF byte, edit,
// or document identifier through the `storage` event channel.
export const DRAFT_CHANGE_PREFIX = 'pdf-toolkit:workspace:draft-change:';
let tabWriterId: string | undefined;

export function getTabWriterId(): string {
  if (tabWriterId) return tabWriterId;
  try {
    const existing = sessionStorage.getItem('pdf-toolkit:draft-writer');
    if (existing) return (tabWriterId = existing);
    const next = crypto.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('pdf-toolkit:draft-writer', next);
    return (tabWriterId = next);
  } catch {
    // expected: blocked sessionStorage, falls back to a random tab id
    return (tabWriterId = `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }
}

export function notifyDraftChange(tool: string, change: DraftChange) {
  try {
    localStorage.setItem(DRAFT_CHANGE_PREFIX + tool, JSON.stringify(change));
  } catch {
    // expected: Coordination is advisory; a blocked localStorage must not stop a draft
    // write that already committed in IndexedDB.
  }
}
