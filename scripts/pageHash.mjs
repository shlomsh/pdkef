import crypto from 'node:crypto';

/**
 * MEM-22: the hash of a file's bytes, recorded per URL in the precache manifest's
 * `hashes` map, which covers every file the build serves unhashed (pages, icons, wasm,
 * the web manifest, fonts). public/sw.js computes the same value (SHA-256, first 16
 * hex characters) over a response's bytes and stores the file only when it matches,
 * so a cache never holds a file from another build.
 */
export function pageHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}
