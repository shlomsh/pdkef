import { describe, expect, it } from 'vitest';
import { classify, isDocsOnly, isFontGuardInput } from '../../scripts/change-scope.mjs';

/* scripts/change-scope.mjs decides, for CI and for `npm run test:e2e`, what a
   change can affect: whether it is docs-only (no build, no browser) and whether
   the 27 font screening guards must run. A miss on the "runs" side is silent
   (things just do not run), so both boundaries are pinned here from both sides. */

describe('docs-only changes', () => {
  it.each([
    'backlog/tasks/MERGE-19.md',
    'docs/seo-competitive-findings.md',
    'docs/i18n-status/snapshot.json',
    'BACKLOG.md',
    'TODO.md',
    'README.md',
    'CLAUDE.md',
    'LICENSE',
    '.claude/rules/editor.md',
    '.impeccable/state.json',
  ])('%s is docs', (file) => {
    expect(isDocsOnly(file)).toBe(true);
  });

  it.each([
    'THIRD_PARTY_LICENSES.md',
    'src/pages/index.astro',
    'src/content/content-pages/pdf-wont-compress-to-100kb.yaml',
    'scripts/generate-backlog.mjs',
    '.github/workflows/ci.yml',
    'package.json',
    'public/manifest.webmanifest',
  ])('%s is not docs', (file) => {
    expect(isDocsOnly(file)).toBe(false);
  });

  it('is docs-only only when every file is docs, and never for an empty change', () => {
    expect(classify(['backlog/tasks/A.md', 'TODO.md']).docs_only).toBe(true);
    expect(classify(['backlog/tasks/A.md', 'src/lib/merge.js']).docs_only).toBe(false);
    expect(classify([]).docs_only).toBe(false);
  });
});

describe('font-guard inputs', () => {
  it.each([
    'public/fonts/Kalam-Regular.ttf',
    'src/editor/text/fonts.js',
    'src/editor/adapters/pdf/sign.js',
    'src/lib/fontCoverageTable.js',
    'src/lib/merge.js',
    'src/test/fixtures/wysiwygStrings.js',
    'e2e/sign/fixtures/shapingGuardHarness.js',
    'e2e/sign/tamil-shaping-guard.spec.js',
    'scripts/font-manifest.mjs',
    'scripts/generate-font-manifest.mjs',
    'scripts/language-acceptance.mjs',
    'scripts/change-scope.mjs',
    'package.json',
    'package-lock.json',
    'patches/pdfjs-dist+6.3.289.patch',
    'playwright.config.js',
    'astro.config.mjs',
    '.github/workflows/ci.yml',
  ])('runs the guards for %s', (file) => {
    expect(isFontGuardInput(file)).toBe(true);
  });

  it.each([
    'src/pages/index.astro',
    'src/content/content-pages/pdf-wont-compress-to-100kb.yaml',
    'src/data/tools.js',
    'src/components/MergeTool/PageStrip.tsx',
    'src/components/PdfSignTool.tsx',
    'src/components/SignTool/textMessages.ts',
    'src/styles/toolPage.css',
    'e2e/merge/merge-layout.spec.js',
    'e2e/home/handoff.spec.js',
    'scripts/check-page-weight.js',
    'backlog/tasks/MERGE-19.md',
    'docs/seo-competitive-findings.md',
    'CLAUDE.md',
    'vitest.config.js',
    'vercel.json',
  ])('skips the guards for %s', (file) => {
    expect(isFontGuardInput(file)).toBe(false);
  });

  it('a docs-only change never runs the guards', () => {
    expect(classify(['backlog/tasks/A.md', 'CLAUDE.md'])).toEqual({ docs_only: true, fonts: false });
  });
});
