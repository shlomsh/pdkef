/** One source file inside a multi-file record (Merge, Image to PDF). */
export interface DraftFile {
  fileName?: string;
  fileType?: string;
  fileBytes: ArrayBuffer;
  [field: string]: unknown;
}

/** One tool's work on an entry, stored verbatim under `work[tool]` next to its revision triple.
 * Everything else in it is the tool's own and opaque here. */
export interface ToolWork {
  revision: number;
  updatedAt: number;
  writerId: string;
  [field: string]: unknown;
}

/** A row of the recency index in localStorage (display metadata only, never bytes or work). */
export interface DraftEntry {
  id: string;
  tool: string;
  fileName: string;
  fileType?: string;
  savedAt: number;
  preview?: string;
  pageCount?: number;
  fileCount?: number;
  hasWork?: string[];
}

/** The IndexedDB record behind one recents entry, keyed `recent:<id>`: the source bytes (one file or
 * `files`) plus every tool's work on it. */
export interface StoredEntry {
  tool: string;
  id: string;
  fileName: string;
  fileType: string;
  fileBytes?: ArrayBuffer;
  files?: DraftFile[];
  savedAt: number;
  work?: Record<string, ToolWork>;
}

/** What `loadRecentFile` returns: the stored entry with `tool` set to the index row's tool. */
export type RecentFileRecord = StoredEntry;

/** What a tool's restore receives from `loadDraft`: the entry's file fields, `sourceId`, `savedAt`,
 * then `work[tool]` spread on top. The work fields are the tool's own, so they read as `unknown`. */
export type DraftRecord = {
  fileName: string;
  fileType: string;
  fileBytes?: ArrayBuffer;
  files?: DraftFile[];
  sourceId: string;
  savedAt: number;
} & Record<string, unknown>;

/** A hand-off record: one file, or a `files` list in pick order. `from` names the sending tool. */
export type HandoffFile = { fileName: string; fileType?: string; fileBytes: ArrayBuffer };
export type HandoffRecord = Partial<HandoffFile> & {
  files?: Partial<HandoffFile>[];
  from?: string;
  tool?: string;
  savedAt?: number;
};

/** Fields `saveDraft` and `cacheRecentFile` read off the record a tool passes; the rest is opaque and
 * stored under `work[tool]`. */
export type DraftSaveRecord = {
  fileName?: string;
  fileType?: string;
  fileBytes?: ArrayBuffer;
  files?: DraftFile[];
  preview?: string;
  pageCount?: number;
  fileCount?: number;
} & Record<string, unknown>;

/** A pre-MEM-01 record, keyed literally by tool name. */
export type LegacyRecord = Partial<ToolWork> & {
  fileName?: string;
  fileType?: string;
  fileBytes?: ArrayBuffer;
  files?: DraftFile[];
  savedAt: number;
  [field: string]: unknown;
};

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** The read edge for IndexedDB entries: every stored entry passes through here. It narrows the type and
 * changes nothing; anything that is not an object (an absent key) is null. */
export function parseStoredEntry(raw: unknown): StoredEntry | null {
  return isObject(raw) ? (raw as unknown as StoredEntry) : null;
}

/** The read edge for hand-off records, same contract as parseStoredEntry. */
export function parseHandoff(raw: unknown): HandoffRecord | null {
  return isObject(raw) ? (raw as HandoffRecord) : null;
}

/** The read edge for legacy per-tool records, same contract as parseStoredEntry. */
export function parseLegacyRecord(raw: unknown): LegacyRecord | null {
  return isObject(raw) ? (raw as unknown as LegacyRecord) : null;
}

/**
 * Parse an IndexedDB value into the record `loadDraft` hands a tool: the entry's file fields, `sourceId`
 * and `savedAt`, with `work[tool]` spread on top. Null when the value is not an entry, or when the entry
 * has neither bytes nor a usable `files` list (Merge's multi-file shape is usable only if every file still
 * carries its bytes). It decides nothing about expiry; loadDraft does that first.
 */
export function parseDraftRecord(raw: unknown, tool: string, id: string): DraftRecord | null {
  const entry = parseStoredEntry(raw);
  if (!entry) return null;
  const work = entry.work?.[tool] || {};
  if (entry.fileBytes) {
    return {
      fileName: entry.fileName, fileType: entry.fileType, fileBytes: entry.fileBytes,
      sourceId: id, savedAt: entry.savedAt, ...work,
    };
  }
  if (Array.isArray(entry.files) && entry.files.length > 0 && entry.files.every((file) => file?.fileBytes)) {
    return {
      fileName: entry.fileName, fileType: entry.fileType, files: entry.files,
      sourceId: id, savedAt: entry.savedAt, ...work,
    };
  }
  return null;
}
