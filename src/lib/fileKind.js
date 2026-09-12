/**
 * Derives which kind of file this is from its MIME type, falling back to the
 * filename extension only when the type is empty (some drag sources hand
 * over a File with no `type` at all). Returns null for anything else, which
 * every caller treats as "not a file this app knows how to handle".
 *
 * @param {File | null | undefined} file
 * @returns {'pdf' | 'image' | null}
 */
export function deriveFileKind(file) {
  if (!file) return null;
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/jpeg' || file.type === 'image/png') return 'image';
  if (!file.type) {
    const match = /\.([^./\\]+)$/.exec(file.name);
    const ext = match ? match[1].toLowerCase() : '';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') return 'image';
  }
  return null;
}
