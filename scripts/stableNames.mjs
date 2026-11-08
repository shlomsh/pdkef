// MEM-25, MEM-31: client code keeps one URL across deploys, so a change inside one module renames
// neither the pages nor the chunks that import it. Every client entry (the scripts and islands a page
// names) is emitted as /site/<name>.js and every other chunk as /shared/<name>.js. Nothing is
// content-hashed: a hashed chunk name is written into each importer, so a change to that chunk renamed
// the importer, and its importers in turn (MEM-25 listed the two hottest chunks by name; MEM-31 measured
// the 300 KB `sign` chunk renamed by four chunks nobody had listed, 361 KB of a 656 KB update). Neither
// folder is immutable: the worker fetches them fresh at install and checks them against the manifest's
// hashes (MEM-22), so what a returning visitor downloads is the files whose bytes changed.
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_DIR = 'site';
export const SHARED_DIR = 'shared';

// Output-name callbacks for the client build (astro.config.mjs). A stable name keeps no inner dot, so
// test:stable-names can tell any `name.<hash>.js` apart.
const stem = (chunk) => chunk.name.replace(/[^\w@-]/g, '_');
export const entryFileName = (chunk) => `${SITE_DIR}/${stem(chunk)}.js`;
export const chunkFileName = (chunk) => `${SHARED_DIR}/${stem(chunk)}.js`;

// Rolldown numbers a file name two chunks ask for (`index2.js`), and which chunk gets the number follows
// build order, so it drifts. The bundle's chunks, as {fileName, name, isEntry}, whose file is not the one
// their name asks for; the plugin below fails the build on any.
export function findRenamedChunks(chunks) {
  return chunks.filter((c) => c.fileName !== (c.isEntry ? entryFileName(c) : chunkFileName(c)));
}

export const stableChunkNames = {
  name: 'pdkef:stable-chunk-names',
  generateBundle(_options, bundle) {
    if (this.environment.name !== 'client') return;
    const renamed = findRenamedChunks(Object.values(bundle).filter((f) => f.type === 'chunk'));
    if (renamed.length) {
      this.error(`MEM-31: ${renamed.map((c) => `${c.fileName} (wanted ${c.isEntry ? entryFileName(c) : chunkFileName(c)})`).join(', ')}: two chunks share a name, so one got a number that drifts between builds and renames its importers. Give one of them another name (a module of its own, or a manualChunks entry in astro.config.mjs).`);
    }
  },
};

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
  const raw = asset.names?.[0] ?? '';
  const name = raw.split('@_@')[0];
  const key = raw.endsWith('.css') ? cssModuleKeys.get(slot(environment, raw)) : undefined;
  if (key) return `${SHARED_DIR}/${path.posix.basename(name, '.css').replace(/[^\w@-]/g, '_')}-${key}.css`;
  return raw.includes('@_@') ? `_astro/${name}.[hash][extname]` : '_astro/[name].[hash][extname]';
};
