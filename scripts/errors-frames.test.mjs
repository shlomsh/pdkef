import { describe, expect, it } from 'vitest';
import { frameLabel, labelStack, staleVerdict, sampleLines } from './errors-frames.mjs';

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
    const run = fake({ ...base, 'merge-base': new Error('exit 1') });
    expect(staleVerdict(args(run))).toBe('likely a stale tab: PdfMergeTool changed after build abc1234 (3 commits behind origin/main)');
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
    const run = (a) => { seen.push(a); return fake({ ...base, 'ls-files': 'a/PdfMergeTool.tsx\nb/PdfMergeTool.js\nc/PdfMergeTool.css\n' })(a); };
    staleVerdict(args(run));
    const log = seen.find((a) => a[0] === 'log');
    expect(log).toEqual(['log', '-1', '--format=%H', 'origin/main', '--', 'a/PdfMergeTool.tsx', 'b/PdfMergeTool.js']);
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

  it('says all vendor when nothing is ours', () => {
    const out = sampleLines({ ...sample, stack: [stack[0]] }, () => { throw new Error('x'); });
    expect(out).toContain('    all frames are vendor code');
  });
});
