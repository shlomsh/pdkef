/**
 * Test OF the generator (ARCH-22 split, out of src/test/cross-tool/languageAcceptance.test.js):
 * keeps docs/language-font-acceptance-matrix.md current with
 * scripts/generate-language-acceptance.mjs's own output. Lives beside the
 * script it tests rather than under src/test/, the same convention rule 8 of
 * docs/module-boundaries.md expects for a checker's own unit test - nothing
 * under src/, public/ or e2e/ may import from scripts/, so a test asserting
 * on scripts/generate-language-acceptance.mjs's matrixMarkdown() output has
 * to live in scripts/ itself.
 *
 * The rest of the acceptance-matrix assertions (rows cross-checked against
 * the real font manifest and coverage report) stay in
 * src/test/cross-tool/languageAcceptance.test.js, importing from src/.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matrixMarkdown } from './generate-language-acceptance.mjs';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');

describe('docs/language-font-acceptance-matrix.md is not stale', () => {
  it('keeps the generated documentation current', () => {
    const documented = readFileSync(join(repoRoot, 'docs', 'language-font-acceptance-matrix.md'), 'utf8');
    // The same comparison `generate-language-acceptance.mjs --check` makes in CI.
    expect(documented).toBe(matrixMarkdown());
  });
});
