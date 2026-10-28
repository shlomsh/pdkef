// MEM-25: the few build outputs that keep one URL across deploys, so a change to a shared module
// renames neither the pages nor the chunks that import it. Every client entry (the scripts and islands
// a page names) is emitted as /site/<name>.js, and the hot shared modules below as /shared/<name>.js;
// everything else stays content-hashed in /_astro/. Neither folder is immutable: the worker fetches
// them fresh at install and checks them against the manifest's hashes (MEM-22).
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
