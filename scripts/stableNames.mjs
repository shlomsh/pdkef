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
// module's CSS, so any edit renamed every class and changed the JS chunk holding the class map; and a
// CSS file's hashed name is part of its own chunk's hash (Vite's augmentChunkHash) and of every preload
// list that names it, so the CSS rename renamed its chunk and their importers too.
// Class names now hash the module's path (relative to the project root, so a second checkout builds
// the same names), and CSS files are named by the CSS modules they hold, not by their bytes.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const relative = (id) => path.relative(ROOT, id.split('?')[0]).split(path.sep).join('/');
const shortHash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 6);
export const cssModuleClassName = (name, filename) => `_${name}_${shortHash(relative(filename))}`;
// That shape, for the guards that tell a CSS Module class apart from a global one.
export const CSS_MODULE_CLASS = /_[\w-]+?_[0-9a-f]{6}(?![\w-])/;

// A CSS file's name is `<chunk name>-<hash of its CSS module paths>.css`. Astro drops a client stylesheet
// when a page inlined the prerender one of the same file name, and inlines both when they differ, so a
// name must match exactly when the two hold the same modules: the module set does, and an edit to one
// module's rules leaves it alone. Vite emits a chunk's CSS during that chunk's renderChunk, right after
// this plugin's (`enforce: 'pre'`) has recorded the chunk's CSS modules under the asset's name.
const CSS_REQUEST = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;
const cssModuleKeys = new Map();
const slot = (environment, assetName) => `${environment}\0${path.posix.basename(assetName)}`;
export const cssAssetKeys = {
  name: 'pdkef:css-asset-keys',
  enforce: 'pre',
  buildStart() {
    for (const key of cssModuleKeys.keys()) if (key.startsWith(`${this.environment.name}\0`)) cssModuleKeys.delete(key);
  },
  renderChunk(_code, chunk) {
    const css = chunk.moduleIds.filter((id) => CSS_REQUEST.test(id)).map(relative).sort();
    if (!css.length) return null;
    const at = slot(this.environment.name, `${chunk.name}.css`);
    const key = shortHash(css.join('\n'));
    if (cssModuleKeys.has(at) && cssModuleKeys.get(at) !== key) this.error(`MEM-26: two chunks named "${chunk.name}" carry different CSS, so their stylesheets cannot keep one name each`);
    cssModuleKeys.set(at, key);
    return null;
  },
};

// Output-name callback per environment. A CSS asset no chunk recorded (a `?url` import) keeps a content
// hash; other assets keep Astro's own naming, which also strips its internal `@_@` page suffix.
export const assetFileName = (environment) => (asset) => {
  const name = (asset.names?.[0] ?? '').split('@_@')[0];
  const key = name.endsWith('.css') ? cssModuleKeys.get(slot(environment, name)) : undefined;
  if (key) return `${SHARED_DIR}/${path.posix.basename(name, '.css').replace(/[^\w@-]/g, '_')}-${key}.css`;
  return asset.names?.[0]?.includes('@_@') ? `_astro/${name}.[hash][extname]` : '_astro/[name].[hash][extname]';
};
