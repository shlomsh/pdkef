/**
 * Builds the quiet, done-state notice for pages whose invisible text layer
 * could not be written, or failed the read-back check, and were saved as a
 * picture alone (see `redactPdf` in `src/editor/adapters/pdf/redact.js`).
 * Pure and framework-free: `PdfRedactTool.tsx` is the only caller.
 *
 * @param pages zero-based page indexes, sorted ascending; usually empty.
 * @returns the notice sentence, or null when nothing needs saying.
 */
export function pictureOnlyNotice(pages: number[]): string | null {
  if (pages.length === 0) return null;

  const oneBased = pages.map((page) => page + 1);

  if (oneBased.length === 1) {
    return `Page ${oneBased[0]} was saved as a picture only, so its text can't be selected.`;
  }

  const list =
    oneBased.length === 2
      ? `${oneBased[0]} and ${oneBased[1]}`
      : `${oneBased.slice(0, -1).join(', ')} and ${oneBased[oneBased.length - 1]}`;

  return `Pages ${list} were saved as pictures only, so their text can't be selected.`;
}
