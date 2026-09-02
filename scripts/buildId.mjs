import crypto from 'node:crypto';

/**
 * A build's identity for cache-busting: every dist file's relative path and
 * content, hashed together into the id `sw.js` uses as its CACHE_VERSION
 * suffix.
 *
 * Must be computed from actual file bytes, not from the (much smaller)
 * precache manifest's URL list. Vite content-hashes JS/CSS filenames, so a
 * change there already produces a new URL and a cache miss on its own - but
 * everything copied verbatim from `public/` (fonts, icons, manifest.webmanifest,
 * robots.txt) keeps the same URL across builds. A visitor whose service worker
 * already cache-first-served the old bytes for one of those URLs would never
 * see a content change to it unless the id backing CACHE_VERSION reflects
 * that content, because `activate` only purges caches whose name differs from
 * the current CACHE_VERSION.
 */
export function computeBuildId(files) {
  const hash = crypto.createHash('sha256');
  for (const { relativePath, content } of files) {
    hash.update(relativePath);
    hash.update('\0');
    hash.update(content);
  }
  return hash.digest('hex').slice(0, 12);
}
