import { attachDraftPreview, deleteDraft, readCurrentEntryId, saveDraft, sourceIdForFiles } from '#lib/drafts/draftStore.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import {
  scanSnapshotKey, SCAN_DRAFT_SCHEMA_VERSION, SCAN_DRAFT_TOOL as TOOL, storedPage, type ScanDraftSettings,
} from '../lib/scanDraft.ts';
import type { ScanPage } from './scanWork.ts';

/** One snapshot of the scan to keep: the pages, the settings, and its key (scanDraft.ts). */
interface ScanSnapshot { pages: ScanPage[]; settings: ScanDraftSettings; key: string }

/**
 * SCAN-18: what one scan session knows about its entry in the shared memory space (draftStore.ts), and the
 * writes to it. One per island, held in a ref like ScanWork.
 *
 * The entry is content-addressed by its photos in page order, so adding, removing, retaking or moving a page
 * makes a new entry. Each save names the entry this session saved before (`supersedes`), which the store
 * deletes, so the scan stays one Recents row while it grows. "This session" is what it restored or saved
 * itself: a scan started fresh, or from a hand-off, never replaces a scan it did not come from.
 *
 * Writes run one after another, so an older snapshot can never land after a newer one.
 */
export class ScanDraftSession {
  /** The snapshot the store holds for this session, so an unchanged scan is never written again. */
  savedKey: string | null = null;
  /** The entry this session restored or last saved: the one the next save replaces. */
  entryId: string | null = null;
  /** Page 1 as a small data URL for the Recents tile, once made. */
  preview: string | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  // Photos are told apart by File identity: a restored photo is a new File, and a retake is a new photo.
  private fileIds = new WeakMap<File, number>();
  private nextFileId = 0;
  // Each photo is read once for the life of its File, not on every autosave.
  private bytes = new WeakMap<File, Promise<ArrayBuffer>>();

  fileId = (file: File): number => {
    let id = this.fileIds.get(file);
    if (id === undefined) {
      id = this.nextFileId++;
      this.fileIds.set(file, id);
    }
    return id;
  };

  keyOf = (pages: ScanPage[], settings: ScanDraftSettings): string | null => (
    pages.length > 0 ? scanSnapshotKey(pages, settings, this.fileId) : null
  );

  /** The scan came back from entry `entryId` as these pages and settings: that is what the store holds. */
  restored(entryId: string, pages: ScanPage[], settings: ScanDraftSettings) {
    this.entryId = entryId;
    this.savedKey = this.keyOf(pages, settings);
  }

  /** Write the snapshot after any write still running. Resolves whether it is saved; never rejects. */
  save({ pages, settings, key }: ScanSnapshot): Promise<boolean> {
    const run = this.chain.then(async () => {
      if (key === this.savedKey) return true;
      const files = await Promise.all(pages.map(async (page) => ({
        fileName: page.file.name,
        fileType: page.file.type || 'image/jpeg',
        fileBytes: await this.bytesOf(page.file),
      })));
      // The id this write addresses, worked out here rather than read back from the pointer, which another
      // Scan tab may move between the write and the read (and this session would then supersede its scan).
      // The digests are cached per buffer, so saveDraft does not hash the photos twice.
      const id = await sourceIdForFiles(files);
      const preview = this.preview;
      const saved = await saveDraft(TOOL, {
        files,
        fileName: settings.name,
        pages: pages.map(storedPage),
        pageSize: settings.pageSize,
        limit: settings.limit,
        name: settings.name,
        defaultFilter: settings.defaultFilter,
        pageCount: pages.length,
        ...(preview ? { preview } : {}),
        schemaVersion: SCAN_DRAFT_SCHEMA_VERSION,
      }, { supersedes: this.entryId });
      if (saved && id) {
        this.savedKey = key;
        this.entryId = id;
        // Page 1's picture arrived while this write ran: the row gets it now, not at the next edit.
        this.attachPreview(preview);
      }
      return saved;
    }).catch((err) => {
      reportError('drafts', err, 'save_scan_draft');
      return false;
    });
    this.chain = run;
    return run;
  }

  /** The scan is over (Clear all, or its last page removed): its work goes after any write still running.
   * The photos stay in Recents (MEM-01: only this tool's work goes, never the entry). */
  forget() {
    this.preview = null;
    this.chain = this.chain.then(async () => {
      // Read after the writes before it: a scan cleared while its first save ran still had an entry.
      const had = this.entryId;
      this.savedKey = null;
      this.entryId = null;
      // This session's entry, not whatever the pointer names now. deleteDraft reports its own failure.
      if (had) await deleteDraft(TOOL, had);
    });
  }

  /** Give the Recents row page 1's picture, when it is newer than `sent` and the row is this session's. */
  attachPreview(sent: string | null = null) {
    if (this.preview && this.preview !== sent && this.entryId && this.entryId === readCurrentEntryId(TOOL)) {
      attachDraftPreview(TOOL, this.preview);
    }
  }

  /** Resolves once every write asked for so far has finished. */
  settled(): Promise<unknown> {
    return this.chain;
  }

  private bytesOf(file: File): Promise<ArrayBuffer> {
    let bytes = this.bytes.get(file);
    if (!bytes) {
      bytes = file.arrayBuffer();
      this.bytes.set(file, bytes);
    }
    return bytes;
  }
}
