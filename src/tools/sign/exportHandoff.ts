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

// Tools that have a Hebrew page of their own (src/content/localized-tools/he).
const HEBREW_TOOLS = new Set(['compress']);

/** Where a hand-off goes: the Hebrew page when Sign is Hebrew and the target has one. */
export function handoffHref(tool: string, pathname: string): string {
  return pathname.startsWith('/he/') && HEBREW_TOOLS.has(tool) ? `/he/${tool}/` : `/${tool}/`;
}
