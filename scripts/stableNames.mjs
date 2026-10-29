// MEM-25: the few build outputs that keep one URL across deploys, so a change to a shared module
// renames neither the pages nor the chunks that import it. Every client entry (the scripts and islands
// a page names) is emitted as /site/<name>.js, and the hot shared modules below as /shared/<name>.js;
// everything else stays content-hashed in /_astro/. Neither folder is immutable: the worker fetches
// them fresh at install and checks them against the manifest's hashes (MEM-22).
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_DIR = 'site';
export const SHARED_DIR = 'shared';

// Shared chunks imported widely and edited often; measured 2026-10-28, renaming either renamed up to
// 17 importers. Each name must match a chunk the build emits (test:stable-names checks it).
export const HOT_SHARED_CHUNKS = ['maintenanceTelemetry', 'openPdfDoc'];

// Output-name callbacks for the client build (astro.config.mjs). `entryFileNames` runs for every entry
// chunk; `chunkFileNames` for the rest, where only the hot shared chunks leave the hashed pattern.
// A stable name keeps no inner dot, so test:stable-names can tell any `name.<hash>.js` apart.
export const entryFileName = (chunk) => `${SITE_DIR}/${chunk.name.replace(/[^\w@-]/g, '_')}.js`;
export const chunkFileName = (chunk) => (HOT_SHARED_CHUNKS.includes(chunk.name) ? `${SHARED_DIR}/${chunk.name}.js` : '_astro/[name].[hash].js');

// MEM-26: a CSS Module edit used to rename 25 chunks. Vite's default class name hashes the whole
// module's CSS, so any edit renamed every class and changed the JS chunk holding the class map; and
// each lazy chunk's preload list named its CSS file by hash, so the CSS rename renamed its importers.
// Class names now hash the module's path (relative to the project root, so a second checkout builds
// the same names), and client CSS files keep one URL in /shared/, so an edit changes only that file.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const cssModuleClassName = (name, filename) => {
  const file = path.relative(ROOT, filename.split('?')[0]).split(path.sep).join('/');
  return `_${name}_${createHash('sha256').update(file).digest('hex').slice(0, 6)}`;
};
// Other assets keep Astro's own naming, which also strips its internal `@_@` page suffix.
export const assetFileName = (asset) => {
  const name = (asset.names?.[0] ?? '').split('@_@')[0];
  if (name.endsWith('.css')) return `${SHARED_DIR}/${name.slice(0, -'.css'.length).replace(/[^\w@-]/g, '_')}.css`;
  return asset.names?.[0]?.includes('@_@') ? `_astro/${name}.[hash][extname]` : '_astro/[name].[hash][extname]';
};
