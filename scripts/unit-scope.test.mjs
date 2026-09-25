import { describe, expect, it } from 'vitest';
import { selectUnitTests, runUnitByImpact, WIDEN_RULES, ORACLE_FILE } from './unit-scope.mjs';

/* scripts/unit-scope.mjs (ARCH-28) selects unit tests by file impact
   (Vitest's own `vitest related` module graph) instead of by Nx project.
   selectUnitTests() is the pure mapping this suite pins directly, the way
   scripts/affected-scope.test.mjs pins deriveScope() - synthetic
   files/exists inputs, no real git or vitest call. runUnitByImpact() is the
   one impure step (a spawnSync call), tested here with an injected fake
   spawn function instead of a real subprocess. */

function file(path, status = 'M') {
  return { path, status };
}

describe('WIDEN_RULES', () => {
  it('is a non-empty table of {id, reason, match, tests}', () => {
    expect(WIDEN_RULES.length).toBeGreaterThan(0);
    for (const rule of WIDEN_RULES) {
      expect(typeof rule.id).toBe('string');
      expect(typeof rule.reason).toBe('string');
      expect(typeof rule.match).toBe('function');
      expect(rule.tests === 'all' || Array.isArray(rule.tests)).toBe(true);
    }
  });

  it('has unique ids', () => {
    const ids = WIDEN_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('selectUnitTests: fail-open cases', () => {
  it('widens to the whole suite for an empty changed-file list', () => {
    const scope = selectUnitTests({ files: [] });
    expect(scope.all).toBe(true);
    expect(scope.seeds).toEqual([]);
    expect(scope.reasons[0]).toMatch(/empty changed-file list/);
  });

  it('widens to the whole suite when the oracle itself (scripts/unit-scope.mjs) changed', () => {
    const scope = selectUnitTests({ files: [file(ORACLE_FILE)] });
    expect(scope.all).toBe(true);
    expect(scope.reasons[0]).toMatch(/CI oracle changed/);
  });

  it('an oracle change wins even alongside an otherwise-narrow file', () => {
    const scope = selectUnitTests({ files: [file('src/tools/merge/PdfMergeTool.tsx'), file(ORACLE_FILE)] });
    expect(scope.all).toBe(true);
  });

  it('widens to the whole suite for an unpaired deletion, even mixed with a real narrow change', () => {
    const scope = selectUnitTests({
      files: [file('src/lib/format.js', 'D'), file('src/tools/merge/PdfMergeTool.tsx', 'M')],
      exists: (p) => p !== 'src/lib/format.js',
    });
    expect(scope.all).toBe(true);
    expect(scope.reasons[0]).toMatch(/unpaired deletion/);
    expect(scope.reasons[0]).toMatch(/src\/lib\/format\.js/);
  });

  it('does not widen for a rename (destination reported as a plain "A", per changedFilesWithStatus) - only a real "D" widens', () => {
    // changedFilesWithStatus() never emits an 'A' entry with a status of 'D'
    // for the same path - this just confirms selectUnitTests only reacts to
    // an actual 'D' status, not to the mere fact that a path is new. Picked a
    // path no widen rule matches (an .astro file - the whole-src scan rules
    // only match .js/.jsx/.ts/.tsx) so the seed list is exactly the one file.
    const scope = selectUnitTests({ files: [file('src/pages/about.astro', 'A')], exists: () => true });
    expect(scope.all).toBe(false);
    expect(scope.seeds).toEqual(['src/pages/about.astro']);
  });

  it('widens when every changed path matches no rule and none survives on disk', () => {
    const scope = selectUnitTests({ files: [file('docs/some-removed-doc.md', 'M')], exists: () => false });
    expect(scope.all).toBe(true);
    expect(scope.reasons[0]).toMatch(/no seed file survives on disk/);
  });
});

describe('selectUnitTests: global config widens (Category 3 of the blind-spot inventory)', () => {
  it.each([
    'vitest.config.js',
    'astro.config.mjs',
    'tsconfig.json',
    'tsconfig.build.json',
    'package.json',
    'package-lock.json',
  ])('%s widens to the whole suite', (path) => {
    const scope = selectUnitTests({ files: [file(path)] });
    expect(scope.all).toBe(true);
  });

  it('does not widen for an unrelated dotfile that merely looks like config', () => {
    const scope = selectUnitTests({ files: [file('src/tools/merge/tsconfigLikeName.ts')], exists: () => true });
    expect(scope.all).toBe(false);
  });
});

describe('selectUnitTests: a core-folder change narrows, it does not force the whole suite (the central ARCH-28 fix)', () => {
  it('src/lib/drafts/draftStore.js selects a handful of seeds, not the whole suite', () => {
    const scope = selectUnitTests({ files: [file('src/lib/drafts/draftStore.js')], exists: () => true });
    expect(scope.all).toBe(false);
    expect(scope.seeds).toContain('src/lib/drafts/draftStore.js');
    expect(scope.seeds).toContain('src/lib/drafts/draftStoreServiceWorkerSync.test.js');
    expect(scope.seeds).toContain('scripts/sw.test.mjs');
    // the whole-src render-call-scan rule also fires (draftStore.js is a
    // non-test .js file under src/) - still nowhere near the ~193-file suite.
    expect(scope.seeds).toContain('src/lib/pdfRender.test.js');
    expect(scope.seeds.length).toBeLessThan(10);
  });

  it('an editor core file (src/editor/model/editorModel.ts) is a plain seed with no matching widen rule', () => {
    const scope = selectUnitTests({ files: [file('src/editor/model/editorModel.ts')], exists: () => true });
    expect(scope.all).toBe(false);
    // still triggers the whole-src render-call-scan rule (any non-test
    // src/**/*.ts file does), but not a wider "editor is core" widen -
    // that Nx-level rule no longer applies to unit selection at all.
    expect(scope.seeds).toEqual(
      expect.arrayContaining(['src/editor/model/editorModel.ts', 'src/lib/pdfRender.test.js', 'src/lib/pdfjsWasm.test.js']),
    );
  });

  it('a shell file (src/shell/BasePdfTool.tsx) also just narrows now', () => {
    const scope = selectUnitTests({ files: [file('src/shell/BasePdfTool.tsx')], exists: () => true });
    expect(scope.all).toBe(false);
    expect(scope.seeds).toEqual(
      expect.arrayContaining(['src/shell/BasePdfTool.tsx', 'src/test/noCamelCaseSvgAttrs.test.js']),
    );
  });
});

describe('selectUnitTests: deduplicates and sorts seeds', () => {
  it('two files that both trigger the same widen rule only add its tests once', () => {
    const scope = selectUnitTests({
      files: [file('public/fonts/A.ttf'), file('public/fonts/B.ttf')],
      exists: () => true,
    });
    const fontsTest = 'src/editor/text/fonts.test.js';
    expect(scope.seeds.filter((s) => s === fontsTest)).toHaveLength(1);
  });

  it('seeds come back sorted', () => {
    const scope = selectUnitTests({
      files: [file('src/tools/split/PdfSplitTool.tsx'), file('src/tools/compress/PdfCompressTool.tsx')],
      exists: () => true,
    });
    expect(scope.seeds).toEqual([...scope.seeds].sort());
  });
});

// One representative changed file per widen rule, pulled from the table
// itself: proves every rule actually fires and adds exactly its own tests
// (plus whatever other rule the same path might also happen to match - the
// whole-src scan rules match almost anything under src/, so assertions use
// `toContain` rather than a full equality check for rows that could overlap).
describe('selectUnitTests: each blind-spot widen rule fires', () => {
  const NON_ALL_RULES = WIDEN_RULES.filter((r) => r.tests !== 'all');

  it.each(NON_ALL_RULES.map((r) => [r.id, r]))('rule "%s" adds its own tests for a matching file', (id, rule) => {
    // Find a representative path the rule's own predicate accepts by probing
    // a handful of real, already-known example inputs used elsewhere in this
    // file/blind-spot inventory - simplest reliable way to get a "some path
    // this rule matches" without re-deriving one from a regex/prefix check.
    const candidates = [
      'src/lib/__fixtures__/sample.pdf',
      'src/tools/sign/fields/__fixtures__/sample.pdf',
      'public/images/redaction-guide/sample.pdf',
      'src/tools/sign/fields/corpus/scoring/baselines.json',
      'scripts/spike/mobi-10/ground-truth/x.json',
      'public/fonts/NewFont-Regular.ttf',
      'public/hero-demo-noscript.css',
      'src/components/HeroDemo/HeroDemo.module.css',
      'public/llms.txt',
      'src/styles/global.css',
      'src/layouts/HomePageLayout.astro',
      'src/content/content-pages/sign-pdf-in-your-language.yaml',
      'src/styles/editorFonts.css',
      'src/lib/drafts/draftStore.js',
      'public/sw.js',
      'src/tools/sign/useFormFieldRegions.ts',
      'scripts/check-editor-dependency-directions.mjs',
      'src/lib/format.js',
      'src/components/HeroDemo/HeroDemo.tsx',
      'backlog/tasks/ARCH-28.md',
    ];
    const example = candidates.find((c) => rule.match(c));
    expect(example, `no candidate path in this test matches rule "${id}" - add one`).toBeDefined();

    const scope = selectUnitTests({ files: [file(example)], exists: () => true });
    expect(scope.all).toBe(false);
    for (const t of rule.tests) {
      expect(scope.seeds).toContain(t);
    }
  });
});

describe('runUnitByImpact', () => {
  function fakeSpawn(results) {
    const calls = [];
    const spawn = (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      const next = results[calls.length - 1] ?? results[results.length - 1];
      return next;
    };
    return { spawn, calls };
  }

  it('runs "vitest related <seeds> --run --passWithNoTests" when scope narrows', () => {
    const { spawn, calls } = fakeSpawn([{ status: 0 }]);
    const status = runUnitByImpact({ all: false, seeds: ['src/lib/format.js', 'src/lib/format.test.js'] }, spawn);
    expect(status).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(['vitest', 'related', 'src/lib/format.js', 'src/lib/format.test.js', '--run', '--passWithNoTests']);
  });

  it('runs the unnarrowed "vitest run" when scope.all is true', () => {
    const { spawn, calls } = fakeSpawn([{ status: 1 }]);
    const status = runUnitByImpact({ all: true, seeds: [] }, spawn);
    expect(status).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(['vitest', 'run']);
  });

  it('propagates a real test-failure exit code from the narrowed run without a second invocation', () => {
    const { spawn, calls } = fakeSpawn([{ status: 1 }]);
    const status = runUnitByImpact({ all: false, seeds: ['src/lib/format.js'] }, spawn);
    expect(status).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('falls back to the full suite when "vitest related" could not even be spawned (a real error, not a test failure)', () => {
    const { spawn, calls } = fakeSpawn([{ error: new Error('ENOENT') }, { status: 0 }]);
    const status = runUnitByImpact({ all: false, seeds: ['src/lib/format.js'] }, spawn);
    expect(status).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[0].args[1]).toBe('related');
    expect(calls[1].args).toEqual(['vitest', 'run']);
  });

  it('runs the full suite directly when scope narrows but ends up with zero seeds', () => {
    const { spawn, calls } = fakeSpawn([{ status: 0 }]);
    runUnitByImpact({ all: false, seeds: [] }, spawn);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(['vitest', 'run']);
  });
});
