/** Lowercase hex SHA-256. Web Crypto when the page has it; otherwise the pure-JS
 * fallback, loaded on demand so secure pages never ship it on first paint. Both
 * give the same digest, so ids match across the two kinds of page. */
async function digestHex(data: ArrayBuffer | Uint8Array): Promise<string> {
  let digest: Uint8Array;
  if (globalThis.crypto?.subtle) {
    digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource));
  } else {
    const { sha256 } = await import('./sha256.ts');
    digest = sha256(data instanceof Uint8Array ? data : new Uint8Array(data));
  }
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Stable content address for one source PDF. Null means the input is not an
 * ArrayBuffer; we fail the best-effort entry write rather than risk a metadata
 * collision attaching work to a different document. Works on pages without Web
 * Crypto (plain-http LAN) through the JS fallback. */
export async function sourceIdForBytes(fileBytes: unknown): Promise<string | null> {
  // `instanceof ArrayBuffer` fails for a File read in a different browser
  // realm (and in the test DOM), even though Web Crypto accepts it.
  if (Object.prototype.toString.call(fileBytes) !== '[object ArrayBuffer]') return null;
  return `sha256:${await digestHex(fileBytes as ArrayBuffer)}`;
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
 * Null (like sourceIdForBytes) means a file has no addressable bytes; callers
 * fail the write rather than risk a metadata collision.
 */
export async function sourceIdForFiles(files: ({ fileBytes?: unknown } | null | undefined)[]): Promise<string | null> {
  const digests = [];
  for (const file of files) {
    // expected: a file without addressable bytes, null means no drafts
    const id = await sourceIdForBytes(file?.fileBytes).catch(() => null);
    if (!id) return null;
    digests.push(id.slice('sha256:'.length));
  }
  return `sha256:${await digestHex(new TextEncoder().encode(digests.join('\n')))}`;
}
