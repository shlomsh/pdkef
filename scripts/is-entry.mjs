// LAND-09: a guard script exports `main(argv, io)` so its tests run it in-process, and runs it only when
// node was started with that file. Comparing `import.meta.url` with `process.argv[1]` as written breaks
// when the start path goes through a symlink (macOS's /var is /private/var): the guard would print nothing
// and pass. Compare real paths instead.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Pure apart from one realpath: true when `startPath` (default: node's own start file) is the module at `metaUrl`. */
export function isEntry(metaUrl, startPath = process.argv[1]) {
  if (!startPath) return false;
  try {
    return fs.realpathSync(path.resolve(startPath)) === fs.realpathSync(fileURLToPath(metaUrl));
  } catch {
    // expected: a start path that does not exist is not this module
    return false;
  }
}
