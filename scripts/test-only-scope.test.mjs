import { describe, expect, it } from 'vitest';
import { narrowTestOnlyChange } from './test-only-scope.mjs';
import { ORACLE_FILES } from './affected-scope.mjs';

describe('narrowTestOnlyChange (ARCH-31)', () => {
  const wideScope = { everything: true, e2e_paths: '', fonts: true, export_guards: true, reason: 'core' };

  it('leaves the scope alone when any non-test file changed', () => {
    const files = ['src/tools/merge/lib/merge.test.js', 'src/tools/merge/lib/merge.js'];
    expect(narrowTestOnlyChange(wideScope, files)).toBe(wideScope);
  });

  it('leaves the scope alone for a spec helper or fixture, which is not a spec', () => {
    const files = ['e2e/sign/fixtures/shapingGuardHarness.js', 'e2e/sign/hebrew-guard.spec.js'];
    expect(narrowTestOnlyChange(wideScope, files)).toBe(wideScope);
  });

  it('leaves a non-.js spec to the Nx verdict, since Playwright would never discover it', () => {
    expect(narrowTestOnlyChange(wideScope, ['src/tools/merge/e2e/new.spec.ts'])).toBe(wideScope);
  });

  it('leaves an empty or docs-only diff to the existing rules', () => {
    expect(narrowTestOnlyChange(wideScope, [])).toBe(wideScope);
    expect(narrowTestOnlyChange(wideScope, ['docs/x.md'])).toBe(wideScope);
  });

  it('unit tests plus docs select no Playwright at all', () => {
    const scope = narrowTestOnlyChange(wideScope, ['src/lib/text/format.test.js', 'backlog/tasks/ARCH-31.md', 'scripts/check-push.test.mjs']);
    expect(scope).toMatchObject({ everything: false, e2e_paths: '', fonts: false, export_guards: false });
  });

  it('an oracle file plus its test keeps the wide scope', () => {
    expect(narrowTestOnlyChange(wideScope, ['scripts/affected-scope.mjs', 'scripts/affected-scope.test.mjs'])).toBe(wideScope);
  });

  it('a font guard spec runs the font guards, an export guard spec the export guards, nothing else', () => {
    expect(narrowTestOnlyChange(wideScope, ['e2e/sign/hebrew-guard.spec.js'])).toMatchObject({ e2e_paths: '', fonts: true, export_guards: false });
    expect(narrowTestOnlyChange(wideScope, ['e2e/sign/noto-parity.spec.js'])).toMatchObject({ e2e_paths: '', fonts: true });
    expect(narrowTestOnlyChange(wideScope, ['e2e/export/export-render-guard.spec.js'])).toMatchObject({ e2e_paths: '', fonts: false, export_guards: true });
  });

  it('a tool spec plus a unit test runs just that spec', () => {
    const scope = narrowTestOnlyChange(wideScope, ['src/tools/merge/e2e/merge-share.spec.js', 'src/tools/merge/lib/merge.test.js']);
    expect(scope).toMatchObject({ everything: false, e2e_paths: 'src/tools/merge/e2e/merge-share.spec.js', fonts: false, export_guards: false });
  });
});

describe('oracle membership (QUAL-35)', () => {
  it('test-only-scope.mjs decides scope, so it is an oracle file', () => {
    expect(ORACLE_FILES.has('scripts/test-only-scope.mjs')).toBe(true);
  });
});
