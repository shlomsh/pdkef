/** Stable content address for one source PDF. Null means this browser cannot
 * safely deduplicate; we fail the best-effort entry write rather than risk a
 * metadata collision attaching work to a different document. */
export async function sourceIdForBytes(fileBytes: unknown): Promise<string | null> {
  // `instanceof ArrayBuffer` fails for a File read in a different browser
  // realm (and in the test DOM), even though Web Crypto accepts it.
  if (Object.prototype.toString.call(fileBytes) !== '[object ArrayBuffer]' || !globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', fileBytes as ArrayBuffer);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Stable content address for an ordered set of source PDFs, for the Merge tool's
 * multi-file entry. Built from the per-file `sourceIdForBytes` digests rather than
 * hashing the concatenated bytes directly, so it stays cheap to compute for large
 * files (each file is hashed once, not copied into one buffer first).
 *
 * Order-sensitive on purpose: the files are hashed in the order they appear in
 * `files`, so the same set of files merged in a different order produces a
 * different id. That is correct here, not an accident to fix - a merge's output
 * depends on file order, so an entry for [A, B] must not be treated as resumable
 * for a session that has since reordered to [B, A].
 *
 * Null (like sourceIdForBytes) means this browser cannot safely deduplicate;
 * callers fail the write rather than risk a metadata collision.
 *
 */
export async function sourceIdForFiles(files: ({ fileBytes?: unknown } | null | undefined)[]): Promise<string | null> {
  const digests = [];
  for (const file of files) {
    // expected: crypto.subtle missing (plain-http LAN), null means no drafts
    const id = await sourceIdForBytes(file?.fileBytes).catch(() => null);
    if (!id) return null;
    digests.push(id.slice('sha256:'.length));
  }
  if (!globalThis.crypto?.subtle) return null;
  const encoded = new TextEncoder().encode(digests.join('\n'));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
