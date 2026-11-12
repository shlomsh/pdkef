import { cacheRecentFile, commitHandoff } from '../drafts/draftStore.ts';
import { clearHandoffPending } from './handoffPending.ts';

type Entry = { fileName?: string; fileType?: string; fileBytes?: ArrayBuffer };
type Record = Entry & { files?: Entry[] };

/**
 * Make a read hand-off durable, then consume it. The record and its pending marker stay until the
 * PDF it carries is in on-device recents, so a reload between the read and the first durable write
 * (service-worker update, refresh, a discarded tab) re-opens the same record instead of an empty
 * page. The recents entry is written bare: the preview upgrades it later by content hash.
 * A failed cache write still commits: nothing durable is possible then, and keeping the record
 * would re-open the file on every visit until `HANDOFF_MAX_AGE_MS`.
 */
export async function settleHandoff(tool: string, record: Record): Promise<void> {
  // A multi record is a set for Merge or Image to PDF, whose own draft holds it; its members must not
  // each take one of the six recents slots, so it commits as soon as it is read.
  const { fileType = 'application/pdf', files } = record;
  // expected: cacheRecentFile reports its own store failure; the file is in hand either way
  if (!files && record.fileBytes && fileType === 'application/pdf') await cacheRecentFile(tool, { ...record, fileType } as never).catch(() => false);
  await commitHandoff(tool);
  clearHandoffPending(tool);
}
