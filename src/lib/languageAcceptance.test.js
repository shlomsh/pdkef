import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LANGUAGE_ACCEPTANCE_MATRIX } from '../../scripts/language-acceptance.mjs';
import { FONT_MANIFEST } from '../../scripts/font-manifest.mjs';
import { matrixMarkdown } from '../../scripts/generate-language-acceptance.mjs';
import { LANGUAGE_COVERAGE } from './fontCoverageReport.js';
import { EXPORT_RENDER_CORPUS } from '../../e2e/sign/fixtures/exportRenderCorpus.js';
import { covers } from '../editor/text/fonts.js';

const fontByFamily = new Map(FONT_MANIFEST.map((font) => [font.family, font]));
const exportCases = new Set(EXPORT_RENDER_CORPUS.map((entry) => entry.id));

describe('language/font acceptance matrix', () => {
  it('has one stable rollout position per row, with shipped rows before planned work', () => {
    expect(LANGUAGE_ACCEPTANCE_MATRIX.map((row) => row.order)).toEqual(
      LANGUAGE_ACCEPTANCE_MATRIX.map((_, index) => index + 1),
    );
    const firstPlanned = LANGUAGE_ACCEPTANCE_MATRIX.findIndex((row) => row.status === 'planned');
    expect(firstPlanned).toBeGreaterThan(0);
    expect(LANGUAGE_ACCEPTANCE_MATRIX.slice(firstPlanned).every((row) => row.status === 'planned')).toBe(true);
  });

  it('names regional distinctions and native direction/digits in every shipped sample', () => {
    for (const row of LANGUAGE_ACCEPTANCE_MATRIX.filter((entry) => entry.status === 'shipped')) {
      expect(row.languages.length, row.id).toBeGreaterThan(0);
      expect(row.regions.length, row.id).toBeGreaterThan(0);
      expect(['ltr', 'rtl'], row.id).toContain(row.direction);
      expect(row.sample, row.id).toMatch(/\p{N}/u);
    }
  });

  it('accepts only families whose every real face draws the row sample', () => {
    for (const row of LANGUAGE_ACCEPTANCE_MATRIX.filter((entry) => entry.status === 'shipped')) {
      for (const family of row.families) {
        const font = fontByFamily.get(family);
        expect(font, `${row.id}: unknown family ${family}`).toBeDefined();
        for (const face of Object.keys(font.faces)) {
          const weight = face === 'bold' || face === 'boldItalic' ? 'bold' : 'normal';
          const style = face === 'italic' || face === 'boldItalic' ? 'italic' : 'normal';
          expect(covers(family, weight, style, row.sample), `${row.id}: ${family} ${face}`).toBe(true);
        }
      }
    }
  });

  it('matches the real-font language report for every declared alphabet', () => {
    for (const row of LANGUAGE_ACCEPTANCE_MATRIX.filter((entry) => entry.status === 'shipped')) {
      for (const coverageId of row.coverageIds) {
        const report = LANGUAGE_COVERAGE[coverageId];
        expect(report, `${row.id}: unknown coverage id ${coverageId}`).toBeDefined();
        const full = new Set(report.full.map((entry) => entry.family));
        for (const family of row.families) {
          expect(full.has(family), `${row.id}: ${family} is not full for ${coverageId}`).toBe(true);
        }
      }
    }
  });

  it('links every shipped shaping/visual claim to a real guard and every named baseline case to the corpus', () => {
    for (const row of LANGUAGE_ACCEPTANCE_MATRIX.filter((entry) => entry.status === 'shipped')) {
      if (row.shaping.status === 'guarded') expect(row.shaping.guards.length, row.id).toBeGreaterThan(0);
      else expect(row.shaping.reason, row.id).toBeTruthy();
      const guards = [...(row.shaping.guards || []), ...row.visual.guards];
      expect(row.visual.guards.length, row.id).toBeGreaterThan(0);
      for (const guard of guards) expect(existsSync(join(process.cwd(), guard)), `${row.id}: ${guard}`).toBe(true);
      for (const id of row.visual.cases) expect(exportCases.has(id), `${row.id}: ${id}`).toBe(true);
    }
  });

  it('keeps planned rows honest: no accepted fonts or evidence before they ship', () => {
    for (const row of LANGUAGE_ACCEPTANCE_MATRIX.filter((entry) => entry.status === 'planned')) {
      expect(row.families, row.id).toEqual([]);
      expect(row.shaping.guards, row.id).toEqual([]);
      expect(row.visual.guards, row.id).toEqual([]);
    }
  });

  it('keeps the generated documentation current', () => {
    const documented = join(process.cwd(), 'docs', 'language-font-acceptance-matrix.md');
    expect(existsSync(documented)).toBe(true);
    expect(matrixMarkdown()).toContain('| 20 | planned | Emoji |');
  });
});

