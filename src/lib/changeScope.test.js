import { describe, expect, it } from 'vitest';
import { isFontGuardInput } from '../../scripts/font-guard-inputs.mjs';

/* scripts/font-guard-inputs.mjs decides, for CI and for `npm run test:e2e`,
   whether the 27 font screening guards can be skipped for a change. A miss on
   the "runs" side is silent (the guards just do not run), so the boundary is
   pinned here from both sides. */

describe('font-guard inputs', () => {
  it.each([
    'public/fonts/Kalam-Regular.ttf',
    'src/editor/text/fonts.js',
    'src/editor/adapters/pdf/sign.js',
    'src/lib/fontCoverageTable.js',
    'src/lib/merge.js',
    'src/components/SignTool/textMessages.ts',
    'src/test/fixtures/wysiwygStrings.js',
    'e2e/sign/fixtures/shapingGuardHarness.js',
    'e2e/sign/tamil-shaping-guard.spec.js',
    'scripts/font-manifest.mjs',
    'scripts/generate-font-manifest.mjs',
    'scripts/language-acceptance.mjs',
    'scripts/font-guard-inputs.mjs',
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
});
