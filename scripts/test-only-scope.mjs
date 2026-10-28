// QUAL-35: ARCH-31's rule, shared by CI (resolveScope in affected-scope.mjs) and
// check:push, so a test-only diff gets the same narrow verdict in both.
import { isDocsOnly } from './change-scope.mjs';

// ARCH-31: a diff of only test files cannot change what a browser sees. Nx
// decides by folder, so a tool's unit test used to select that tool's e2e and
// every site-wide spec (measured: a `merge.test.js`-only change ran 67s of
// Playwright). When every non-docs file is a unit test (`*.test.*`) or a
// Playwright spec (`*.spec.js`), the unit tests run by impact as always and
// Playwright runs only the changed specs: the font guards and export guards
// only when one of their own specs changed (the globs mirror FONT_GUARDS and
// EXPORT_GUARDS in playwright.config.js). Anything else in the diff, a spec
// helper or fixture included, keeps the Nx verdict.
const isUnitTest = (f) => /\.test\.[^/]+$/.test(f);
// Only `.spec.js`: Playwright's testMatch discovers nothing else, so any other
// `.spec.*` keeps the Nx verdict rather than narrowing to a spec that never runs.
const isSpec = (f) => /\.spec\.js$/.test(f);
const isFontGuardSpec = (f) => /(^|\/)sign\/[^/]+-(guard|parity)\.spec\.js$/.test(f);
const isExportGuardSpec = (f) => /(^|\/)export\/(export-render-guard|language-acceptance)\.spec\.js$/.test(f);

export function narrowTestOnlyChange(scope, files) {
  const code = files.filter((f) => !isDocsOnly(f));
  if (code.length === 0 || !code.every((f) => isUnitTest(f) || isSpec(f))) return scope;
  const specs = code.filter(isSpec);
  const productSpecs = specs.filter((f) => !isFontGuardSpec(f) && !isExportGuardSpec(f));
  return {
    ...scope,
    everything: false,
    e2e_paths: productSpecs.join(' '),
    fonts: specs.some(isFontGuardSpec),
    export_guards: specs.some(isExportGuardSpec),
    reason: specs.length ? `test files only: Playwright runs the ${specs.length} changed spec(s)` : 'unit test files only: no Playwright',
  };
}
