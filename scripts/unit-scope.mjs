#!/usr/bin/env node
// ARCH-28: unit tests selected by file impact (Vitest's own module graph),
// not by Nx project. Before this, `scripts/affected-scope.mjs`'s CORE_PROJECTS
// rule (site/shell/editor/lib) ran all ~193 unit test files on any change
// under those four folders - measured 46 of 53 wide runs in the ARCH-22
// window - even though `npx vitest related <file> --run` alone already
// selects a handful of real dependents for most of those same files (2 for
// an editor file, 13 for a lib file, 1 for a shell file - see
// backlog/tasks/ARCH-28.md's own numbers). This file is the new, single
// source of truth for "which test files does a set of changed files
// select", used by CI's `checks` job, `check:push` and `check:fast` alike -
// see resolveUnitScope()/runUnitByImpact() at the bottom.
//
// `vitest related` cannot see a file that a test reads with `node:fs`
// (readFileSync/readdirSync) instead of `import`, or a test that walks the
// whole repo at run time, or a change to shared config that alters what
// "related" even means. WIDEN_RULES below is the explicit, unit-tested
// compensation table for exactly those blind spots - one rule per resource
// bucket, each backed by a measured or same-pattern-inferred row in the
// ARCH-28 blind-spot inventory (ask the ticket's owner for the working
// scratchpad if the exact provenance is needed; the shape of each rule is
// reproduced in scripts/unit-scope.test.mjs).
//
// One pleasant fact this file leans on throughout: passing a TEST file's own
// path as a `vitest related` seed selects exactly that file. Vitest's
// `filterTestsBySource()` seeds its "affected" set with the `related` list
// itself (`const affected = new Set(related)`) before walking import edges
// backwards from it, so a seed that is itself a discovered test spec matches
// directly - confirmed empirically on this tree: `npx vitest related
// src/lib/pdfRender.test.js --run` runs exactly that one file. That means a
// widen rule's `tests` entries can be handed to the very same `vitest
// related` call as the changed source files, no second Vitest invocation
// needed to add them.
//
// Usage:
//   node scripts/unit-scope.mjs [--base <ref>] [--head <ref>]
//     Prints the resolved scope (all/seeds/reasons) as KEY=value lines.
//   node scripts/unit-scope.mjs --run
//     Resolves the same way, then actually runs `npx vitest related
//     <seeds> --run --passWithNoTests`, or `npx vitest run` (unnarrowed) when
//     the scope widened. Exits with that command's status.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { resolveBase, changedFilesWithStatus } from './change-scope.mjs';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

function isTestFile(f) {
  return /\.(test|spec)\.[^/]+$/.test(f);
}

// This file is the oracle deciding what narrows for units - never trust a
// narrowed run to validate the code that decided to narrow it, the same
// reasoning scripts/affected-scope.mjs's ORACLE_FILES gives for itself. The
// two scripts it computes the diff and the Nx scope with count too.
export const ORACLE_FILES = new Set(['scripts/unit-scope.mjs', 'scripts/change-scope.mjs', 'scripts/affected-scope.mjs']);

// The one pure, exported, unit-tested table every blind spot in the ARCH-28
// inventory turned into a rule. `tests: 'all'` widens the whole push to the
// full suite (global config: changing it can alter what "related" even
// means, or what every test's behavior is, with no import edge to see);
// `tests: [...]` is a literal list of test file paths, added to the seed
// list alongside the changed files themselves (see the file header for why
// that's enough - no second merge step is needed here).
export const WIDEN_RULES = [
  {
    id: 'ci-workflows',
    reason: 'a workflow change alters the environment every CI test runs in (checkout depth, Node, env); run 34890208527 broke gitLastModified.test.js this way',
    match: (f) => f.startsWith('.github/workflows/'),
    tests: 'all',
  },
  {
    id: 'vitest-config',
    reason: 'vitest.config.js defines what "related" means; a change here can silently narrow, widen or misconfigure everything',
    match: (f) => f === 'vitest.config.js',
    tests: 'all',
  },
  {
    id: 'astro-config',
    reason: 'astro.config.mjs can change module resolution/aliasing every test relies on',
    match: (f) => f === 'astro.config.mjs',
    tests: 'all',
  },
  {
    id: 'tsconfig',
    reason: 'a tsconfig change can alter type resolution with no import edge to trace',
    match: (f) => /^tsconfig(\..+)?\.json$/.test(f),
    tests: 'all',
  },
  {
    id: 'package-manifest',
    reason: 'a dependency version bump can change the behavior of every test that transitively depends on it',
    match: (f) => f === 'package.json' || f === 'package-lock.json',
    tests: 'all',
  },
  {
    id: 'lib-pdf-fixtures',
    reason: 'read by fs.readFileSync/path.resolve, not imported (11 tool round-trip tests)',
    match: (f) => f.startsWith('src/lib/__fixtures__/'),
    tests: [
      'src/editor/adapters/pdf/redact.test.js',
      'src/editor/adapters/pdf/sign.test.js',
      'src/tools/compress/compress.test.js',
      'src/tools/edit-pages/editPages.test.js',
      'src/tools/merge/PdfMergeTool.test.tsx',
      'src/tools/merge/merge.test.js',
      'src/tools/redact/PdfRedactTool.test.tsx',
      'src/tools/security/security.test.js',
      'src/tools/sign/PdfSignTool.test.tsx',
      'src/tools/split/PdfSplitTool.test.tsx',
      'src/tools/to-image/toImage.test.js',
    ],
  },
  {
    id: 'sign-field-fixtures',
    reason: 'PDF fixtures read by path under src/tools/sign/fields/__fixtures__/',
    match: (f) => f.startsWith('src/tools/sign/fields/__fixtures__/'),
    tests: [
      'src/tools/sign/fieldOrder.fixtures.test.js',
      'src/tools/sign/fields/formGrid.fixtures.test.js',
      'src/tools/sign/fields/corpus/corpus.test.js',
    ],
  },
  {
    id: 'redaction-guide-sample-pdf',
    reason: 'the committed practice-form PDF is read by path, not imported',
    match: (f) => f === 'public/images/redaction-guide/sample.pdf',
    tests: [
      'src/tools/sign/fields/formWidgets.test.js',
      'src/tools/sign/fields/formGrid.fixtures.test.js',
      'src/tools/sign/fields/corpus/corpus.test.js',
      'src/tools/sign/fields/corpus/scoring/scoring.test.js',
    ],
  },
  {
    id: 'scoring-corpus',
    reason: 'baselines.json, its forms and ground-truth files are all read by path from scoring.test.js',
    match: (f) => f.startsWith('src/tools/sign/fields/corpus/scoring/') || f.startsWith('scripts/spike/mobi-10/ground-truth/'),
    tests: ['src/tools/sign/fields/corpus/scoring/scoring.test.js'],
  },
  {
    id: 'font-binaries',
    reason: 'real font binaries under public/fonts/ are read by name/readdirSync, not imported',
    match: (f) => f.startsWith('public/fonts/'),
    tests: [
      'src/editor/text/fontAttribution.test.js',
      'src/editor/text/fontCoverage.test.js',
      'src/editor/text/fontCoverageTable.test.js',
      'src/editor/text/fonts.test.js',
      'src/editor/text/liveFontCoverage.test.js',
      'src/editor/registry/hebrewMarkPlacement.test.js',
      'src/editor/registry/textShaping.test.js',
      'src/test/cross-tool/textCoverage.test.js',
      'src/editor/adapters/pdf/sign.test.js',
      'src/tools/sign/PdfSignTool.test.tsx',
    ],
  },
  {
    id: 'hero-demo-css-text-read',
    reason: 'read via fs.readFileSync for a text assertion; nothing imports this CSS Module in production',
    match: (f) => f === 'public/hero-demo-noscript.css' || f === 'src/components/HeroDemo/HeroDemo.module.css',
    tests: ['src/components/HeroDemo/heroDemoStageDefaults.test.js'],
  },
  {
    id: 'llms-txt',
    reason: 'public/llms.txt is read with fs.readFileSync(path.join(process.cwd(), ...))',
    match: (f) => f === 'public/llms.txt',
    tests: ['src/data/llmsTxt.test.js'],
  },
  {
    id: 'home-page-shell-text-read',
    reason: 'global.css and the home layout are read as text for a contrast/markup check',
    match: (f) => f === 'src/styles/global.css' || f === 'src/layouts/HomePageLayout.astro',
    tests: ['src/styles/colorContrast.test.js', 'src/pages/__tests__/index.test.js'],
  },
  {
    id: 'sign-language-content-page',
    reason: 'the SEO content page is checked against editor coverage data, not imported',
    match: (f) => f === 'src/content/content-pages/sign-pdf-in-your-language.yaml',
    tests: ['src/test/seo/signLanguagePage.test.js'],
  },
  {
    id: 'editor-fonts-css',
    reason: 'generated font CSS read as text (also covered by font-binaries for the fonts it lists)',
    match: (f) => f === 'src/styles/editorFonts.css',
    tests: ['src/editor/text/fonts.test.js'],
  },
  {
    id: 'draft-store-sw-text-read',
    reason: 'draftStore.js and public/sw.js are each read as text by the other\'s sync guard, not imported',
    match: (f) => f === 'src/lib/drafts/draftStore.js' || f === 'public/sw.js',
    tests: ['src/lib/drafts/draftStoreServiceWorkerSync.test.js', 'scripts/sw.test.mjs'],
  },
  {
    id: 'form-field-regions-text-parse',
    reason: 'read as text and statically parsed (deliberately not imported - a .js test can\'t import a .ts file here)',
    match: (f) => f === 'src/tools/sign/useFormFieldRegions.ts',
    tests: ['src/tools/sign/useFormFieldRegions.wiring.test.js'],
  },
  {
    id: 'editor-dependency-directions-subprocess',
    reason: 'the checker script runs as a child process against fixture trees, not an import',
    match: (f) => f === 'scripts/check-editor-dependency-directions.mjs' || f.startsWith('scripts/fixtures/editor-dependency-directions/'),
    tests: ['src/editor/dependencyDirections.test.js'],
  },
  {
    id: 'whole-src-render-call-scan',
    reason: 'pdfRender.test.js/pdfjsWasm.test.js/the import-scan guard walk every non-test src file at run time looking for call-site patterns',
    match: (f) => !isTestFile(f) && f.startsWith('src/') && /\.(js|jsx|ts|tsx)$/.test(f),
    tests: ['src/lib/pdfRender.test.js', 'src/lib/pdfjsWasm.test.js', 'scripts/check-module-boundaries.import-scan.test.mjs'],
  },
  {
    id: 'whole-src-import-scan',
    reason: "the import-scan guard walks collectSourceFiles(SRC), which also takes .mjs and .astro (scripts/check-module-boundaries.mjs), so those need it too",
    match: (f) => !isTestFile(f) && f.startsWith('src/') && /\.(mjs|astro)$/.test(f),
    tests: ['scripts/check-module-boundaries.import-scan.test.mjs'],
  },
  {
    id: 'licenses-text-read',
    reason: 'fontAttribution.test.js reads THIRD_PARTY_LICENSES.md and src/pages/licenses.astro with readFileSync',
    match: (f) => f === 'THIRD_PARTY_LICENSES.md' || f === 'src/pages/licenses.astro',
    tests: ['src/editor/text/fontAttribution.test.js'],
  },
  {
    id: 'whole-src-tsx-camelcase-scan',
    reason: 'one it() per .tsx file under src/, generated by walking the directory, not by importing each file',
    match: (f) => !isTestFile(f) && f.startsWith('src/') && f.endsWith('.tsx'),
    tests: ['src/test/noCamelCaseSvgAttrs.test.js'],
  },
  {
    id: 'backlog-tasks-guard',
    reason: 'backlog-data.test.mjs asserts against the real backlog/tasks/ directory',
    match: (f) => f.startsWith('backlog/tasks/'),
    tests: ['scripts/backlog-data.test.mjs'],
  },
];

// ---------------------------------------------------------------------------
// Pure: given the changed files (each `{ path, status }`, status one of
// 'A'/'M'/'D' - changedFilesWithStatus() already turns a detected rename
// into just its destination path with status 'A', so there is no separate
// 'R' to handle here; see that function's own comment for why) and an
// `exists` probe, decide whole-suite vs. a seed list for `vitest related`.
// No git/vitest call in here - scripts/unit-scope.test.mjs exercises this
// directly with synthetic inputs, the way affected-scope.test.mjs pins
// deriveScope().
export function selectUnitTests({ files, exists = () => true }) {
  if (files.length === 0) {
    return { all: true, seeds: [], reasons: ['empty changed-file list'] };
  }

  const paths = files.map((f) => f.path);

  const oracleHits = paths.filter((p) => ORACLE_FILES.has(p));
  if (oracleHits.length > 0) {
    return { all: true, seeds: [], reasons: [`CI oracle changed: ${oracleHits.join(', ')}`] };
  }

  for (const rule of WIDEN_RULES) {
    if (rule.tests !== 'all') continue;
    const hits = paths.filter(rule.match);
    if (hits.length > 0) {
      return { all: true, seeds: [], reasons: [`widen rule "${rule.id}" (${rule.reason}): ${hits.join(', ')}`] };
    }
  }

  // A deletion `vitest related` can never see: the path is gone, so it
  // silently contributes zero tests (measured: exit 0, "No test files
  // found"). A basename/path git-grep at the base commit was considered and
  // rejected as the primary mechanism for this - a generic basename both
  // false-positives (an unrelated file of the same name) and false-negatives
  // (a re-export hides the real reference) too easily to trust for
  // something CI treats as authoritative - so an unpaired deletion widens to
  // the whole suite instead, the same fail-open direction every other
  // ambiguous case here takes.
  const deletions = files.filter((f) => f.status === 'D');
  if (deletions.length > 0) {
    return { all: true, seeds: [], reasons: [`unpaired deletion (no reliable way to find its tests): ${deletions.map((f) => f.path).join(', ')}`] };
  }

  const reasons = [];
  const extraTests = new Set();
  for (const rule of WIDEN_RULES) {
    if (rule.tests === 'all') continue;
    const hits = paths.filter(rule.match);
    if (hits.length === 0) continue;
    reasons.push(`widen rule "${rule.id}" (${rule.reason}): ${hits.join(', ')}`);
    for (const t of rule.tests) extraTests.add(t);
  }

  const existingChanged = paths.filter((p) => exists(p));
  const seeds = [...new Set([...existingChanged, ...extraTests])].sort();

  if (seeds.length === 0) {
    return { all: true, seeds: [], reasons: ['no seed file survives on disk'] };
  }

  return { all: false, seeds, reasons: reasons.length ? reasons : ['narrowed to vitest related'] };
}

// ---------------------------------------------------------------------------
// Impure: resolves the same base scripts/affected-scope.mjs's resolveScope()
// does (reused from change-scope.mjs, so the two cannot resolve two
// different diffs for the same push), reads real file statuses and real
// disk state, and calls selectUnitTests() above. This is the one function
// CI, check:push and check:fast all call - see the header comment.
export function resolveUnitScope({ explicitBase, explicitHead } = {}) {
  const base = resolveBase(explicitBase);
  if (!base) {
    return { all: true, seeds: [], reasons: [`no usable base (${explicitBase ?? 'origin/main'})`] };
  }

  const files = changedFilesWithStatus(base, explicitHead);
  return selectUnitTests({ files, exists: (p) => existsSync(join(ROOT, p)) });
}

// Exported for scripts/check-push.mjs and scripts/affected-scope.mjs's
// callers: given the scope resolveUnitScope() (or a synthetic one in a test)
// returned, actually run the selected unit tests. A spawn-level failure (the
// process could not even be started - not a real test failure, which still
// exits through spawnSync normally) is the "vitest related errors" fail-open
// case: fall back to the full, unnarrowed `vitest run`.
export function runUnitByImpact(scope, spawn = spawnSync) {
  if (!scope.all && scope.seeds.length > 0) {
    const result = spawn('npx', ['vitest', 'related', ...scope.seeds, '--run', '--passWithNoTests'], { stdio: 'inherit', cwd: ROOT });
    if (!result.error) return result.status ?? 1;
    console.error(`unit-scope: "vitest related" could not be started (${result.error.message}); falling back to the full suite.`);
  }
  const result = spawn('npx', ['vitest', 'run'], { stdio: 'inherit', cwd: ROOT });
  return result.status ?? 1;
}

function printScope(scope) {
  console.log(`all=${scope.all}`);
  console.log(`seeds=${scope.seeds.join(' ')}`);
  console.log(`reason=${scope.reasons.join(' | ')}`);
}

function main(argv) {
  const baseIndex = argv.indexOf('--base');
  const headIndex = argv.indexOf('--head');
  const explicitBase = baseIndex >= 0 ? argv[baseIndex + 1] : undefined;
  const explicitHead = headIndex >= 0 ? argv[headIndex + 1] : undefined;

  const scope = resolveUnitScope({ explicitBase, explicitHead });
  console.error(`unit-scope: ${scope.reasons.join(' | ')}`);

  if (argv.includes('--run')) return runUnitByImpact(scope);

  printScope(scope);
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  process.exit(main(process.argv.slice(2)));
}
