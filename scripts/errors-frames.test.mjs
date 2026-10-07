import { describe, expect, it } from 'vitest';
import { frameLabel, labelStack, sampleLines, sourceMap, staleVerdict } from './errors-frames.mjs';

describe('frameLabel', () => {
  it.each([
    ['pdf-lib.CqiVumd9.js:45:2284', 'pdf-lib', true, 'pdf-lib (vendor)'],
    ['sortable.esm.BqtE8hmV.js:1:29107', 'sortable.esm', true, 'sortable (vendor)'],
    ['PdfMergeTool.C4ILDZF-.js:2:16571', 'PdfMergeTool', false, 'PdfMergeTool'],
    ['pageText.DNcbxBoK.js:1:4425', 'pageText', false, 'pageText'],
    ['useCurrentPage.BeluWNw3.js:2:1814', 'useCurrentPage', false, 'useCurrentPage'],
    ['pdf.Zn9K1YuS.js:44:106886', 'pdf', true, 'pdf (vendor)'],
    ['hooks.module.AbCdEfGh.js:1:2', 'hooks.module', true, 'preact (vendor)'],
    ['createLucideIcon.AbCdEfGh.js:1:2', 'createLucideIcon', true, 'lucide (vendor)'],
  ])('%s', (raw, module, vendor, label) => {
    expect(frameLabel(raw)).toEqual({ module, vendor, label });
  });

  it('keeps dots inside the module name', () => {
    const r = frameLabel('BaseLayout.astro_astro_type_script_index_0_lang.DQ8nrrZb.js:3:4');
    expect(r.module).toBe('BaseLayout.astro_astro_type_script_index_0_lang');
    expect(r.vendor).toBe(false);
  });

  it('never throws on malformed input', () => {
    expect(frameLabel('garbage')).toEqual({ module: null, vendor: false, label: 'garbage' });
    expect(frameLabel(undefined).vendor).toBe(false);
    expect(frameLabel(42).label).toBe('42');
  });
});

describe('real chunk names from dist/_astro (a module with no source file under src/ is a library)', () => {
  const sources = sourceMap([
    'src/tools/merge/PdfMergeTool.tsx', 'src/editor/adapters/pdf/sign.js', 'src/layouts/BaseLayout.astro',
    'src/tools/merge/FileList.module.css', 'src/pages/sign.astro', 'scripts/foo.mjs',
  ].join('\n'));
  it.each([
    ['jsxRuntime.module.CvYDfTTB.js:1:5', 'preact (vendor)'],
    ['preact.module.AbCdEfGh.js:1:5', 'preact (vendor)'],
    ['signals.module.AbCdEfGh.js:1:5', 'preact (vendor)'],
    ['preload-helper.AbCdEfGh.js:1:5', 'preload-helper (library)'],
    ['rolldown-runtime.AbCdEfGh.js:1:5', 'rolldown-runtime (library)'],
    ['client.AbCdEfGh.js:1:5', 'client (library)'],
    ['eraser.D_UjLgtD.js:1:5', 'eraser (library)'],
    ['file-pen-line.Cmu9p6cV.js:1:5', 'file-pen-line (library)'],
  ])('%s is not ours', (raw, label) => {
    const r = frameLabel(raw, sources);
    expect(r.vendor).toBe(true);
    expect(r.label).toBe(label);
  });
  it.each([
    ['PdfMergeTool.C4ILDZF-.js:2:1', 'PdfMergeTool'],
    ['sign.BZwc3-wN.js:1:1', 'sign'],
    ['FileList.module.AbCdEfGh.js:1:1', 'FileList.module'],
    ['BaseLayout.astro_astro_type_script_index_0_lang.DQ8nrrZb.js:1:1', 'BaseLayout.astro_astro_type_script_index_0_lang'],
  ])('%s is ours', (raw, module) => {
    expect(frameLabel(raw, sources)).toMatchObject({ module, vendor: false, label: module });
  });
  it('a stack of preact internals above our component names the component, not jsxRuntime', () => {
    const r = labelStack(['jsxRuntime.module.CvYDfTTB.js:1:5', 'hooks.module.BlcUXMq4.js:1:9', 'PdfSignTool.XXXXXXXX.js:2:3'], sourceMap('src/tools/sign/PdfSignTool.tsx'));
    expect(r.firstOurs).toEqual({ index: 2, module: 'PdfSignTool' });
  });
  it('without a file list it falls back to the vendor table alone', () => {
    expect(frameLabel('eraser.D_UjLgtD.js:1:5')).toMatchObject({ vendor: false });
    expect(frameLabel('jsxRuntime.module.CvYDfTTB.js:1:5')).toMatchObject({ vendor: true });
  });
});

describe('labelStack', () => {
  it('finds the first frame of ours', () => {
    const r = labelStack(['pdf-lib.CqiVumd9.js:45:2284', 'PdfMergeTool.C4ILDZF-.js:2:16571']);
    expect(r.frames.map((f) => f.label)).toEqual(['pdf-lib (vendor)', 'PdfMergeTool']);
    expect(r.firstOurs).toEqual({ index: 1, module: 'PdfMergeTool' });
  });

  it('reports no first-of-ours on an all-vendor stack', () => {
    const r = labelStack(['pdf-lib.CqiVumd9.js:45:2284', 'pdf.Zn9K1YuS.js:44:106886']);
    expect(r.firstOurs).toBeNull();
  });

  it('tolerates a missing stack', () => {
    expect(labelStack(undefined)).toEqual({ frames: [], firstOurs: null });
  });
});

const BUILD = 'abc1234';
const fake = (over = {}) => (args) => {
  const key = args.join(' ');
  for (const [prefix, v] of Object.entries(over)) {
    if (key.startsWith(prefix)) {
      if (v instanceof Error) throw v;
      return v;
    }
  }
  throw new Error(`unexpected git ${key}`);
};
const base = {
  'ls-files': 'src/tools/merge/PdfMergeTool.tsx\nsrc/lib/other.ts\n',
  'rev-parse': 'abc1234abc1234\n',
  'log -1': 'f00dfeed\n',
  'merge-base': '',
  'rev-list --count': '3\n',
};

describe('staleVerdict', () => {
  const args = (run, extra = {}) => ({ module: 'PdfMergeTool', build: BUILD, run, ...extra });

  it('says current when the last touch is an ancestor of the build', () => {
    expect(staleVerdict(args(fake(base)))).toBe('build abc1234 has the latest PdfMergeTool (3 commits behind origin/main)');
  });

  it('says stale when the module changed after the build', () => {
    const run = fake({ ...base, 'merge-base': Object.assign(new Error('exit 1'), { status: 1 }) });
    expect(staleVerdict(args(run))).toBe('likely a stale tab: PdfMergeTool changed after build abc1234 (3 commits behind origin/main)');
  });

  it.each([
    ['git failed (exit 128)', Object.assign(new Error('fatal'), { status: 128 })],
    ['the 5s timeout killed it', Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT', status: null })],
    ['an error with no status', new Error('x')],
  ])('prints nothing, not a stale verdict, when merge-base fails for another reason: %s', (_why, err) => {
    expect(staleVerdict(args(fake({ ...base, 'merge-base': err })))).toBeNull();
  });

  it('does not call a docs or page edit a change to the chunk of the same name', () => {
    // sign.js is the editor adapter chunk `sign`; src/pages/sign.astro is the marketing page.
    const seen = [];
    const run = (a) => { seen.push(a); return fake({ ...base, 'ls-files': 'src/editor/adapters/pdf/sign.js\nsrc/pages/sign.astro\nscripts/fixtures/x/sign.js\n' })(a); };
    staleVerdict({ module: 'sign', build: BUILD, run });
    expect(seen.find((a) => a[0] === 'log')).toEqual(['log', '-1', '--format=%H', 'origin/main', '--', 'src/editor/adapters/pdf/sign.js']);
  });

  it('finds the .astro file behind an astro script chunk', () => {
    const seen = [];
    const run = (a) => { seen.push(a); return fake({ ...base, 'ls-files': 'src/layouts/BaseLayout.astro\n' })(a); };
    staleVerdict({ module: 'BaseLayout.astro_astro_type_script_index_0_lang', build: BUILD, run });
    expect(seen.find((a) => a[0] === 'log')).toContain('src/layouts/BaseLayout.astro');
  });

  it('prints nothing when no file matches', () => {
    expect(staleVerdict(args(fake({ ...base, 'ls-files': 'src/x/Other.ts\n' })))).toBeNull();
  });

  it('prints nothing for an unknown build sha', () => {
    expect(staleVerdict(args(fake({ ...base, 'rev-parse': new Error('bad') })))).toBeNull();
  });

  it('prints nothing when git throws', () => {
    expect(staleVerdict(args(() => { throw new Error('no git'); }))).toBeNull();
  });

  it('prints nothing without a build or module', () => {
    expect(staleVerdict(args(fake(base), { build: undefined }))).toBeNull();
    expect(staleVerdict(args(fake(base), { module: null }))).toBeNull();
  });

  it('passes every matching file to git log when two share a basename', () => {
    const seen = [];
    const run = (a) => { seen.push(a); return fake({ ...base, 'ls-files': 'src/a/PdfMergeTool.tsx\nsrc/b/PdfMergeTool.js\nsrc/c/PdfMergeTool.css\nsrc/a/PdfMergeTool.test.tsx\n' })(a); };
    staleVerdict(args(run));
    const log = seen.find((a) => a[0] === 'log');
    expect(log).toEqual(['log', '-1', '--format=%H', 'origin/main', '--', 'src/a/PdfMergeTool.tsx', 'src/b/PdfMergeTool.js', 'src/c/PdfMergeTool.css']);
  });

  it('omits the behind count if it fails', () => {
    const run = fake({ ...base, 'rev-list --count': new Error('x') });
    expect(staleVerdict(args(run))).toBe('build abc1234 has the latest PdfMergeTool');
  });
});

describe('sampleLines', () => {
  const stack = ['pdf-lib.CqiVumd9.js:45:2284', 'PdfMergeTool.C4ILDZF-.js:2:16571'];
  const sample = { step: 'edit', tool: 'merge', installed: false, sw: true, age: '5m', actions: ['add'], stack };

  it('prints labelled frames, the summary and the plain resolve command without a build', () => {
    const out = sampleLines(sample, () => { throw new Error('x'); });
    expect(out).toContain('    #1 pdf-lib (vendor)  pdf-lib.CqiVumd9.js:45:2284');
    expect(out).toContain('    first of ours: #2 PdfMergeTool');
    expect(out[0]).toContain('build unknown (older tab)');
    expect(out.at(-1)).toBe(`    npm run errors:resolve -- ${stack.join(' ')}`);
  });

  it('adds --build and the stale note when a build is present', () => {
    const out = sampleLines({ ...sample, build: BUILD }, fake(base));
    expect(out[0]).toContain('build abc1234');
    expect(out.at(-1)).toBe(`    npm run errors:resolve -- ${stack.join(' ')} --build abc1234`);
    expect(out.some((l) => l.includes('has the latest PdfMergeTool'))).toBe(true);
  });

  it('prints translated only when the sample says so', () => {
    const run = () => { throw new Error('x'); };
    expect(sampleLines(sample, run)[0]).not.toContain('translated');
    expect(sampleLines({ ...sample, translated: true }, run)[0]).toContain(' · translated');
  });

  it('says all vendor when nothing is ours', () => {
    const out = sampleLines({ ...sample, stack: [stack[0]] }, () => { throw new Error('x'); });
    expect(out).toContain('    all frames are vendor code');
  });
});
