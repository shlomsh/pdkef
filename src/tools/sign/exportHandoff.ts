/** A signed export, tagged with the document revision it was made from. */
export interface SignedExport {
  blob: Blob;
  name: string;
  revision: number;
}

/**
 * The export, only while the document is still the one it was made from. Any
 * edit bumps the revision, so a stale signed file is never handed to another tool.
 */
export function exportAtRevision(signed: SignedExport | null, revision: number): SignedExport | null {
  return signed && signed.revision === revision ? signed : null;
}

/**
 * The signed file a hand-off can carry right now without exporting again: the
 * recorded export, else the prepared share file, whichever is for this revision.
 */
export function exportToHandOff(
  signed: SignedExport | null,
  prepared: SignedExport | null,
  revision: number,
): SignedExport | null {
  return exportAtRevision(signed, revision) ?? exportAtRevision(prepared, revision);
}

/**
 * Whether there is a signed export to offer: exactly when the completion pair's
 * Download is enabled (editing, not blocked) and something is placed. A restored
 * draft counts. The same gate the background export prepares under.
 */
export function signExportReady({ status, elementCount, blocked }: { status: string; elementCount: number; blocked: boolean }): boolean {
  return status === 'editing' && elementCount > 0 && !blocked;
}

// Tools that have a Hebrew page of their own (src/content/localized-tools/he).
const HEBREW_TOOLS = new Set(['compress']);

/** Where a hand-off goes: the Hebrew page when Sign is Hebrew and the target has one. */
export function handoffHref(tool: string, pathname: string): string {
  return pathname.startsWith('/he/') && HEBREW_TOOLS.has(tool) ? `/he/${tool}/` : `/${tool}/`;
}
