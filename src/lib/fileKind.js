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

/**
 * The MIME type a known file should carry, so bytes saved and rebuilt later
 * (hand-offs, Merge's saved sets) keep their kind even when the browser handed
 * over an untyped File. Same rules as deriveFileKind; null for anything else.
 *
 * @param {File | null | undefined} file
 * @returns {'application/pdf' | 'image/jpeg' | 'image/png' | null}
 */
export function mimeTypeOf(file) {
  const kind = deriveFileKind(file);
  if (kind === 'pdf') return 'application/pdf';
  if (kind !== 'image') return null;
  if (file.type) return file.type;
  return /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg';
}
