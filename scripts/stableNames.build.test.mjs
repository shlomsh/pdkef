import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import astroConfig from '../astro.config.mjs';
import { assetFileName, cssAssetKeys } from './stableNames.mjs';

// MEM-26: a fixture shaped like the production graph, built twice with the client build's real naming
// and CSS Module options from astro.config.mjs. Two islands import a shared chunk; the shared chunk lazily
// loads a panel whose CSS Module is the only file edited between the builds. Measured 2026-10-29, editing
// src/shell/PdfTool.module.css renamed 25 chunks: the class names hashed the file's CSS, and the importers'
// preload lists named the CSS file by its hash.
const FIXTURE = {
  'islandA.js': "import { load } from './shared.js';\nexport const a = () => load();\n",
  'islandB.js': "import { load } from './shared.js';\nexport const b = () => load();\n",
  'shared.js': "export const load = () => import('./panel.js');\n",
  'panel.js': "import styles from './panel.module.css';\nexport default styles.panel + ' ' + styles.title;\n",
  'panel.module.css': '.panel { padding: 1rem; }\n.title { color: red; }\n',
};
const EDITED_CSS = '.panel { padding: 2rem; margin: 0; }\n\n.title { color: blue; }\n';

const root = mkdtempSync(path.join(tmpdir(), 'mem26-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

// One client build of the fixture: its emitted files, by name, with their text.
async function buildFixture(css) {
  for (const [name, text] of Object.entries({ ...FIXTURE, 'panel.module.css': css })) writeFileSync(path.join(root, name), text);
  const output = astroConfig.vite.environments.client.build.rolldownOptions.output;
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    css: astroConfig.vite.css,
    plugins: astroConfig.vite.plugins.filter((plugin) => plugin.name === 'pdkef:css-asset-keys'),
    build: {
      write: false,
      minify: false,
      rolldownOptions: { input: { islandA: path.join(root, 'islandA.js'), islandB: path.join(root, 'islandB.js') }, output, preserveEntrySignatures: 'exports-only' },
    },
  });
  const files = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
  return new Map(files.map((f) => [f.fileName, f.type === 'chunk' ? f.code : String(f.source)]));
}

describe('a CSS Module edit (MEM-26)', () => {
  it('changes only the CSS file that holds it', async () => {
    const before = await buildFixture(FIXTURE['panel.module.css']);
    const after = await buildFixture(EDITED_CSS);
    const renamed = [...after.keys()].filter((name) => !before.has(name));
    const changed = [...after.keys()].filter((name) => before.has(name) && before.get(name) !== after.get(name));
    expect({ renamed, changed }).toEqual({ renamed: [], changed: [expect.stringMatching(/^shared\/panel-[0-9a-f]{6}\.css$/)] });
  });

  it('keeps class names unique per file', () => {
    const scoped = astroConfig.vite.css.modules.generateScopedName;
    expect(scoped('title', path.resolve('src/a.module.css'))).not.toBe(scoped('title', path.resolve('src/b.module.css')));
    expect(scoped('title', path.resolve('src/a.module.css'))).toMatch(/^_title_[\w-]+$/);
  });
});

describe('assetFileName', () => {
  // An Astro page's CSS is emitted as `<page>@_@astro.css`; its lookup must keep the suffix the chunk was
  // recorded under, or the sheet falls back to a hashed /_astro/ name (seen on the first 'auto' build).
  it('names a page stylesheet by its module set, without the @_@ suffix', () => {
    const context = { environment: { name: 'prerender' }, error: (message) => { throw new Error(message); } };
    cssAssetKeys.buildStart.call(context);
    cssAssetKeys.renderChunk.call(context, '', { name: 'redact@_@astro', moduleIds: [path.resolve('src/pages/redact.astro?astro&type=style&index=0&lang.css')] });
    expect(assetFileName('prerender')({ names: ['redact@_@astro.css'] })).toMatch(/^shared\/redact-[0-9a-f]{6}\.css$/);
    expect(assetFileName('prerender')({ names: ['logo.svg'] })).toBe('_astro/[name].[hash][extname]');
  });
});

// Keep the fixture honest: the edited CSS must really reach the build.
it('the fixture edit reaches the CSS output', async () => {
  const after = await buildFixture(EDITED_CSS);
  expect([...after.values()].some((text) => text.includes('2rem'))).toBe(true);
  expect(readFileSync(path.join(root, 'panel.module.css'), 'utf8')).toBe(EDITED_CSS);
});
