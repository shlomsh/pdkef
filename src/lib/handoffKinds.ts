import { deriveFileKind } from './fileKind.js';

/**
 * One hand-off key can open two pages: `compress` is the key for both Compress (PDFs) and
 * Compress Image (photos), which mount the same island. Whoever loads first used to take the
 * record whatever it held, so a PDF parked for /compress/ opened on /compress-image/ (production,
 * 2026-10-15). These two pure functions say what a page takes, so the store leaves a record for
 * the page it was meant for. Pure on purpose: no DOM, no store.
 */

type Kind = 'pdf' | 'image';
type HandoffEntry = { fileName?: string; fileType?: string; fileBytes?: ArrayBuffer };
type HandoffRecord = HandoffEntry & { files?: HandoffEntry[] };

/** The kinds of file the page at `pathname` collects `tool`'s hand-off for, or null for no restriction. */
export function handoffKindsForPage(tool: string, pathname: string): readonly Kind[] | null {
  if (tool !== 'compress') return null;
  return pathname.split('/').includes('compress-image') ? ['image'] : ['pdf'];
}

/** True when every file of the record is a kind the page takes. A missing type reads as a PDF, as `filesFromHandoff` builds it. */
export function handoffFitsPage(record: HandoffRecord, kinds: readonly Kind[] | null): boolean {
  if (!kinds) return true;
  const entries = Array.isArray(record.files) ? record.files : [record];
  return entries.every((entry) => {
    const kind = deriveFileKind({ name: entry.fileName ?? '', type: entry.fileType || 'application/pdf' } as File);
    return kind !== null && kinds.includes(kind);
  });
}
