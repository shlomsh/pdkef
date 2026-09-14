// Pins scripts/check-module-boundaries.mjs's five rules (docs/module-boundaries.md's
// numbering) with a table of (from, to) pairs, both allowed and forbidden, so the
// classification + rule logic has a unit test and not only the whole-tree AST/regex
// scan `npm run test:module-boundaries` runs. classify()/ruleViolation() are the
// checker's own exported helpers - this file is not a reimplementation of them.
import { describe, expect, it } from 'vitest';
import { classify, ruleViolation, testImportViolation } from '../../scripts/check-module-boundaries.mjs';

function check(from, to) {
  return ruleViolation(classify(from), classify(to), to);
}

describe('module boundaries: classify()', () => {
  it('classifies each folder the target layout names', () => {
    expect(classify('src/shell/BasePdfTool.tsx')).toBe('shell');
    expect(classify('src/editor-ui/ColorPicker.tsx')).toBe('editor-ui');
    expect(classify('src/editor/model/element.ts')).toBe('editor');
    expect(classify('src/lib/format.js')).toBe('lib');
    expect(classify('src/constants/signGeometry.js')).toBe('lib');
    expect(classify('src/i18n/translate.js')).toBe('site-i18n');
    expect(classify('src/data/tools.js')).toBe('site-data');
    expect(classify('src/pages/tools/merge.astro')).toBe('site');
    expect(classify('src/layouts/BaseLayout.astro')).toBe('site');
    expect(classify('src/content/content-pages/merge.yaml')).toBe('site');
    expect(classify('src/styles/homePage.css')).toBe('site');
    expect(classify('src/test/setup.js')).toBe('test-support');
    expect(classify('src/tools/merge/PdfMergeTool.tsx')).toBe('tool:merge');
    expect(classify('src/tools/sign/components/DraggableWrapper.tsx')).toBe('tool:sign');
  });

  it('splits flat src/components/ into site (.astro) and components (everything else)', () => {
    expect(classify('src/components/ToolHero.astro')).toBe('site');
    expect(classify('src/components/HeroDemo/ScrollDriver.tsx')).toBe('components');
    expect(classify('src/components/compareFigure.css')).toBe('components');
  });

  it('leaves paths outside the target layout unclassified', () => {
    expect(classify('src/assets/logo.svg')).toBeNull();
    expect(classify('src/content.config.ts')).toBeNull();
  });
});

describe('module boundaries: ruleViolation() - rule 1, a tool', () => {
  it('may not import another tool', () => {
    expect(check('src/tools/merge/PdfMergeTool.tsx', 'src/tools/sign/PdfSignTool.tsx'))
      .toBe('a tool may not import another tool');
  });

  it('may import its own other files (same tool, not a violation)', () => {
    expect(check('src/tools/merge/mergePlan.ts', 'src/tools/merge/PdfMergeTool.tsx')).toBeNull();
  });

  it('may not import the site surface', () => {
    expect(check('src/tools/merge/mergePlan.ts', 'src/pages/tools/merge.astro'))
      .toBe('a tool may import site-i18n and site-data but not site (pages/layouts/content/styles) or the flat components module');
  });

  it('may not import the flat components module', () => {
    expect(check('src/tools/merge/mergePlan.ts', 'src/components/HeroDemo/ScrollDriver.tsx'))
      .toBe('a tool may import site-i18n and site-data but not site (pages/layouts/content/styles) or the flat components module');
  });

  it.each([
    ['src/shell/BasePdfTool.tsx'],
    ['src/editor-ui/ColorPicker.tsx'],
    ['src/editor/model/element.ts'],
    ['src/lib/format.js'],
    ['src/constants/signGeometry.js'],
    ['src/i18n/translate.js'],
    ['src/data/tools.js'],
  ])('may import %s', (to) => {
    expect(check('src/tools/merge/mergePlan.ts', to)).toBeNull();
  });
});

describe('module boundaries: ruleViolation() - rule 2, core modules', () => {
  it.each([
    ['src/shell/BasePdfTool.tsx', 'shell'],
    ['src/editor-ui/ColorPicker.tsx', 'editor-ui'],
    ['src/editor/model/element.ts', 'editor'],
    ['src/lib/format.js', 'lib'],
  ])('%s (%s) may not import a tool', (from, moduleName) => {
    expect(check(from, 'src/tools/sign/PdfSignTool.tsx')).toBe(`${moduleName} may not import a tool`);
  });

  it.each([
    ['src/shell/BasePdfTool.tsx', 'shell'],
    ['src/editor/model/element.ts', 'editor'],
  ])('%s (%s) may not import the components module', (from, moduleName) => {
    expect(check(from, 'src/components/HeroDemo/ScrollDriver.tsx'))
      .toBe(`${moduleName} may not import the components module`);
  });
});

describe('module boundaries: ruleViolation() - rule 3, editor is headless', () => {
  it('may not import editor-ui', () => {
    expect(check('src/editor/registry/renderers.ts', 'src/editor-ui/ElementToolbar.tsx'))
      .toBe('editor is headless: it may not import editor-ui or shell');
  });

  it('may not import shell', () => {
    expect(check('src/editor/registry/renderers.ts', 'src/shell/BasePdfTool.tsx'))
      .toBe('editor is headless: it may not import editor-ui or shell');
  });

  it('editor-ui importing editor is not a violation (the direction is allowed)', () => {
    expect(check('src/editor-ui/ElementToolbar.tsx', 'src/editor/registry/renderers.ts')).toBeNull();
  });
});

describe('module boundaries: ruleViolation() - rule 4, site reaches a tool only through its island', () => {
  it('allows a page importing the Pdf*Tool.tsx entry point', () => {
    expect(check('src/pages/tools/merge.astro', 'src/tools/merge/PdfMergeTool.tsx')).toBeNull();
  });

  it('forbids a page reaching past the entry point into tool internals', () => {
    expect(check('src/pages/tools/merge.astro', 'src/tools/merge/mergePlan.ts'))
      .toBe('site may reach a tool only through its Pdf*Tool.tsx island entry point');
  });

  it('forbids site-i18n reaching past the entry point the same way', () => {
    expect(check('src/i18n/translate.js', 'src/tools/merge/mergePlan.ts'))
      .toBe('site may reach a tool only through its Pdf*Tool.tsx island entry point');
  });

  it('allows site-data importing the entry point itself', () => {
    expect(check('src/data/tools.js', 'src/tools/merge/PdfMergeTool.tsx')).toBeNull();
  });
});

describe('module boundaries: ruleViolation() - rule 5, components', () => {
  it('may not import a tool', () => {
    expect(check('src/components/HeroDemo/ScrollDriver.tsx', 'src/tools/merge/PdfMergeTool.tsx'))
      .toBe('the components module may not import a tool');
  });

  it('may import a core module', () => {
    expect(check('src/components/HeroDemo/ScrollDriver.tsx', 'src/shell/BasePdfTool.tsx')).toBeNull();
  });
});

describe('module boundaries: ruleViolation() - test infrastructure (src/test/)', () => {
  it('may not import a tool', () => {
    expect(check('src/test/setup.js', 'src/tools/merge/PdfMergeTool.tsx'))
      .toBe('test infrastructure under src/test/ may not import a tool');
  });

  it('may import a core module to build its harness', () => {
    expect(check('src/test/setup.js', 'src/lib/format.js')).toBeNull();
  });
});

describe('module boundaries: testImportViolation() - rule 6, test files scanned for cross-tool imports', () => {
  it('forbids a core test importing a tool', () => {
    expect(testImportViolation('src/editor/workspace/x.test.tsx', 'src/tools/sign/PdfSignTool.tsx'))
      .toBe('a test under editor may not import a tool');
  });

  it('forbids a tool:a test importing tool:b', () => {
    expect(testImportViolation('src/tools/merge/PdfMergeTool.test.tsx', 'src/tools/sign/PdfSignTool.tsx'))
      .toBe('a tool:merge test may not import another tool');
  });

  it('allows a tool:a test importing its own tool', () => {
    expect(testImportViolation('src/tools/merge/PdfMergeTool.test.tsx', 'src/tools/merge/mergePlan.ts')).toBeNull();
  });

  it('allows a core test importing another core module', () => {
    expect(testImportViolation('src/editor/workspace/x.test.tsx', 'src/lib/format.js')).toBeNull();
  });

  it('allows a src/test/cross-tool/ test importing a tool', () => {
    expect(testImportViolation('src/test/cross-tool/x.test.tsx', 'src/tools/sign/PdfSignTool.tsx')).toBeNull();
  });

  it('allows a test directly under src/test/ importing a tool', () => {
    expect(testImportViolation('src/test/foo.test.js', 'src/tools/sign/PdfSignTool.tsx')).toBeNull();
  });
});
