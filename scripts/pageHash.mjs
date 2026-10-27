import crypto from 'node:crypto';

/**
 * MEM-22: a page's identity within a build, recorded per page in the precache
 * manifest's `html` map. public/sw.js computes the same value (SHA-256, first 16
 * hex characters) over a refreshed navigation's bytes and stores the page only
 * when it matches, so a cache never holds a page from another build.
 */
export function pageHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}
