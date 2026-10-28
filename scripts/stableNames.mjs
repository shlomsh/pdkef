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
