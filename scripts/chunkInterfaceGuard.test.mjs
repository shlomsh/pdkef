import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import astroConfig from '../astro.config.mjs';
import {
  GUARD_ERROR,
  GUARD_EXPORT,
  chunkInterfaceGuard,
  exportPairs,
  guardEdges,
  guardPrelude,
  interfaceHash,
  lazyChunkNames,
  shiftMapDown,
  specifier,
} from './chunkInterfaceGuard.mjs';
import { stableChunkNames } from './stableNames.mjs';

describe('exportPairs', () => {
  it('reads each exported name with the binding it exports', () => {
    expect(exportPairs('var a = 1;\nexport { f2 as n, f3 as r, f1 as t };\n')).toEqual(['n=f2', 'r=f3', 't=f1']);
    expect(exportPairs('export{x};')).toEqual(['x=x']);
  });
  it('skips a re-export and returns null for a chunk with no table of its own', () => {
    expect(exportPairs('export { t as default } from "../shared/x.js";')).toBeNull();
    expect(exportPairs('console.log(1);')).toBeNull();
  });
});

describe('interfaceHash', () => {
  it('is the same for the same table and differs when only the bindings behind the names move', () => {
    expect(interfaceHash(['n=f2', 'r=f3'])).toBe(interfaceHash(['n=f2', 'r=f3']));
    // the same names, permuted: the failure MEM-51 measured (29 of 29 names, all different functions)
    expect(interfaceHash(['n=f3', 'r=f2'])).not.toBe(interfaceHash(['n=f2', 'r=f3']));
    expect(interfaceHash(['n=f2'])).not.toBe(interfaceHash(['n=f2', 'r=f3']));
  });
  it('is a short hex string, nothing per deploy', () => {
    expect(interfaceHash(['n=f2'])).toMatch(/^[0-9a-f]{6}$/);
  });
});

describe('guard edges', () => {
  const chunks = [
    { fileName: 'site/page.js', isEntry: true, imports: ['shared/common.js'] },
    { fileName: 'shared/common.js', isEntry: false, imports: [] },
    { fileName: 'shared/x-late.js', isEntry: false, imports: ['shared/common.js', 'shared/y-late.js', 'shared/side-effect.js'] },
    { fileName: 'shared/y-late.js', isEntry: false, imports: ['shared/common.js'] },
    { fileName: 'shared/side-effect.js', isEntry: false, imports: [] },
  ];
  const hashes = new Map([['shared/common.js', 'aaaaaa'], ['shared/y-late.js', 'bbbbbb']]);

  it('lazy chunks are the ones no entry reaches statically', () => {
    expect([...lazyChunkNames(chunks)].sort()).toEqual(['shared/side-effect.js', 'shared/x-late.js', 'shared/y-late.js']);
  });
  it('guards a lazy chunk against each chunk it imports that has an interface', () => {
    expect([...guardEdges(chunks, hashes)]).toEqual([
      ['shared/x-late.js', ['shared/common.js', 'shared/y-late.js']],
      ['shared/y-late.js', ['shared/common.js']],
    ]);
  });
  it('writes the specifier the way the bundler does', () => {
    expect(specifier('shared/a.js', 'shared/b.js')).toBe('./b.js');
    expect(specifier('site/a.js', 'shared/b.js')).toBe('../shared/b.js');
  });
  it('the prelude imports each constant first and throws on any difference', () => {
    expect(guardPrelude('shared/x-late.js', ['shared/common.js', 'shared/y-late.js'], hashes)).toBe(
      `import{${GUARD_EXPORT} as _g0}from"./common.js";import{${GUARD_EXPORT} as _g1}from"./y-late.js";if(_g0!=="aaaaaa"||_g1!=="bbbbbb")throw Error("${GUARD_ERROR} x-late");\n`,
    );
  });
  it('shifts a source map down by the line the prelude adds', () => {
    expect(JSON.parse(shiftMapDown(JSON.stringify({ version: 3, mappings: 'AAAA;AACA' }))).mappings).toBe(';AAAA;AACA');
  });
});

// A fixture shaped like the production graph: two page entries and a lazy chunk, all importing one shared
// chunk, built twice. In build B the shared chunk's interface changed (an export added and the bindings behind
// two names swapped), which is what a deploy that touches a shared module does to its export letters.
const SHARED_A = 'export const first = (x) => x + 1;\nexport const second = (x) => x * 2;\n';
const SHARED_B = 'export const second = (x) => x * 2;\nexport const first = (x) => x + 100;\nexport const third = (x) => x - 3;\n';
const PAGE_B_A = "import { first, second } from './shared.js';\nconsole.log(first(1), second(2), second(3));\n";
const PAGE_B_B = "import { first, second, third } from './shared.js';\nconsole.log(first(1), second(2), third(3), third(4));\n";
const fixture = (shared, pageB) => ({
  'pageA.js': "import { first, second } from './shared.js';\nexport const a = () => import('./late.js').then((m) => m.run(first, second));\n",
  'pageB.js': pageB,
  'shared.js': shared,
  'late.js': "import { first, second } from './shared.js';\nexport const run = () => [first(1), second(2)];\n",
});

const root = mkdtempSync(path.join(tmpdir(), 'mem51-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function buildFixture(name, shared, pageB = PAGE_B_A, guard = true) {
  const src = path.join(root, `${name}-src`);
  const out = path.join(root, name);
  mkdirSync(src, { recursive: true });
  for (const [file, text] of Object.entries(fixture(shared, pageB))) writeFileSync(path.join(src, file), text);
  // The real client naming (stable names), not its code-splitting groups, which name modules of the real graph.
  const { codeSplitting: _groups, ...output } = astroConfig.vite.environments.client.build.rolldownOptions.output;
  await build({
    root: src,
    configFile: false,
    logLevel: 'silent',
    plugins: guard ? [stableChunkNames, chunkInterfaceGuard] : [stableChunkNames],
    build: {
      outDir: out,
      emptyOutDir: true,
      minify: true,
      rolldownOptions: { input: { pageA: path.join(src, 'pageA.js'), pageB: path.join(src, 'pageB.js') }, output, preserveEntrySignatures: 'exports-only' },
    },
  });
  writeFileSync(path.join(out, 'package.json'), '{"type":"module"}');
  return out;
}

// Evaluated by Node itself, not through the test runner: its module transform turns a missing named import
// into `undefined` instead of the link error a browser gives.
const evaluate = (dir, file) => {
  const url = pathToFileURL(path.join(dir, file)).href;
  const script = `import(${JSON.stringify(url)}).then((m) => console.log('OK ' + JSON.stringify(m.run())), (e) => console.log('ERR ' + e.name + ': ' + e.message));`;
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }).trim();
};

// A directory holding one build's shared chunk and another build's lazy chunk: what a tab sees when it
// evaluated the first and then fetches the second. A fresh directory each time, as the module cache is keyed by URL.
let mixes = 0;
function mix(sharedText, lateFile) {
  const dir = path.join(root, `mix${mixes++}`);
  mkdirSync(path.join(dir, 'shared'), { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(path.join(dir, 'shared/shared.js'), sharedText);
  cpSync(lateFile, path.join(dir, 'shared/late.js'));
  return dir;
}
const read = (dir, file) => readFileSync(path.join(dir, file), 'utf8');

describe('a lazy chunk beside the other build’s shared chunk', () => {
  it('evaluates beside its own build’s shared chunk', async () => {
    const a = await buildFixture('a', SHARED_A);
    expect(evaluate(a, 'shared/late.js')).toBe('OK [2,4]');
  });

  it('fails to evaluate beside the other build’s shared chunk, instead of binding the wrong names', async () => {
    const a = await buildFixture('a2', SHARED_A);
    const b = await buildFixture('b2', SHARED_B, PAGE_B_B);
    // the new lazy chunk beside the old shared chunk (the deployed-while-open case), and the other way round
    expect(evaluate(mix(read(a, 'shared/shared.js'), path.join(b, 'shared/late.js')), 'shared/late.js')).toContain(`ERR Error: ${GUARD_ERROR} late`);
    expect(evaluate(mix(read(b, 'shared/shared.js'), path.join(a, 'shared/late.js')), 'shared/late.js')).toContain(`ERR Error: ${GUARD_ERROR} late`);
  });

  it('keeps a lazy chunk’s bytes the same while the interface it imports is the same', async () => {
    const one = await buildFixture('c1', SHARED_A);
    const two = await buildFixture('c2', SHARED_A.replace('x + 1', 'x + 1 + 0'));
    // an edit inside a function body does not change the export table, so the late chunk is byte-identical
    expect(read(two, 'shared/late.js')).toBe(read(one, 'shared/late.js'));
    expect(read(two, 'shared/shared.js')).not.toBe(read(one, 'shared/shared.js'));
  });

  it('a pre-guard shared chunk (no guard export) fails to link, a failure chunkReload also recognises', async () => {
    const b = await buildFixture('b3', SHARED_B, PAGE_B_B);
    const dir = mix('export const first = (x) => x;\nexport const second = (x) => x;\n', path.join(b, 'shared/late.js'));
    expect(evaluate(dir, 'shared/late.js')).toMatch(new RegExp(`^ERR SyntaxError: .*${GUARD_EXPORT}`));
  });

  it('is needed: without the guard the same mix links and runs with the wrong functions', async () => {
    const a = await buildFixture('u-a', SHARED_A, PAGE_B_A, false);
    const b = await buildFixture('u-b', SHARED_B, PAGE_B_B, false);
    // build B's lazy chunk calls first(1) and second(2): beside A's shared chunk they bind to other functions
    const own = evaluate(b, 'shared/late.js');
    const mixed = evaluate(mix(read(a, 'shared/shared.js'), path.join(b, 'shared/late.js')), 'shared/late.js');
    // build B's first() adds 100; beside build A's shared chunk the same call runs A's first() and nobody is told
    expect(own).toBe('OK [101,4]');
    expect(mixed).toBe('OK [2,4]');
  });
});
