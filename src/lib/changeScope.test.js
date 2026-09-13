import { describe, expect, it } from 'vitest';
import { classify, isDocsOnly } from '../../scripts/change-scope.mjs';

/* scripts/change-scope.mjs decides, for CI and for `npm run test:e2e`, whether
   a change is docs-only (no build, no browser). Whether the font screening
   guards must run is scripts/affected-scope.mjs's question now (a real Nx
   project over public/fonts/, src/editor/, src/lib/ and tool-sign, not a
   second hand-kept list here) - see src/lib/affectedScope.test.js. */

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
    expect(classify(['backlog/tasks/A.md', 'src/tools/merge/merge.js']).docs_only).toBe(false);
    expect(classify([]).docs_only).toBe(false);
  });
});
