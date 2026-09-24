// Pins scripts/check-module-boundaries.mjs's five rules (docs/module-boundaries.md's
// numbering) with a table of (from, to) pairs, both allowed and forbidden, so the
// classification + rule logic has a unit test and not only the whole-tree AST/regex
// scan `npm run test:module-boundaries` runs. classify()/ruleViolation() are the
// checker's own exported helpers - this file is not a reimplementation of them.
import { describe, expect, it } from 'vitest';
import {
  classify, ruleViolation, specRouteViolation, testImportViolation,
  scriptSrcSpecifiers, commonLayerConsumers, commonLayerConsumerViolations,
  astroScriptSrcEdges, buildEdges,
} from './check-module-boundaries.mjs';

function check(from, to) {
  return ruleViolation(classify(from), classify(to), to);
}

describe('module boundaries: classify()', () => {
  it('classifies each folder the target layout names', () => {
    expect(classify('src/shell/BasePdfTool.tsx')).toBe('shell');
    expect(classify('src/editor-ui/ColorPicker.tsx')).toBe('editor-ui');
    expect(classify('src/editor/model/element.ts')).toBe('editor');
    expect(classify('src/lib/format.js')).toBe('lib');
    expect(classify('src/site-lib/markdownRender.js')).toBe('site');
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

  it.each([
    ['src/shell/BasePdfTool.tsx', 'shell'],
    ['src/editor-ui/ColorPicker.tsx', 'editor-ui'],
    ['src/editor/model/element.ts', 'editor'],
    ['src/lib/format.js', 'lib'],
  ])('%s (%s) may not import site (pages/layouts/content/styles)', (from, moduleName) => {
    expect(check(from, 'src/pages/index.astro'))
      .toBe(`${moduleName} may import site-i18n and site-data but not site (pages/layouts/content/styles)`);
  });

  it('may import site-i18n and site-data', () => {
    expect(check('src/editor/model/element.ts', 'src/i18n/translate.js')).toBeNull();
    expect(check('src/editor/model/element.ts', 'src/data/tools.js')).toBeNull();
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

describe('rule 7: a tool spec under src/tools/<t>/e2e/ may only reference its own routes', () => {
  // A small literal map, not the real src/pages/ derivation - DEBT-01's brief
  // is explicit that this test should not depend on src/pages/.
  const routeMap = new Map([
    ['/sign', 'sign'],
    ['/redact', 'redact'],
    ['/compress', 'compress'],
  ]);

  it('allows a spec that only visits its own tool route', () => {
    const source = "await page.goto('/sign');";
    expect(specRouteViolation('src/tools/sign/e2e/sign-editor.spec.js', source, routeMap)).toEqual([]);
  });

  it('allows a spec that visits "/" (never in the route map, so never a foreign route)', () => {
    const source = "await page.goto('/');";
    expect(specRouteViolation('src/tools/sign/e2e/sign-editor.spec.js', source, routeMap)).toEqual([]);
  });

  it('forbids another tool\'s route as a plain string literal', () => {
    const source = "const tools = [{ path: '/sign' }, { path: '/redact' }];";
    expect(specRouteViolation('src/tools/sign/e2e/toolbar-touch-targets.spec.js', source, routeMap))
      .toEqual([{ route: '/redact', owner: 'redact' }]);
  });

  it('forbids another tool\'s route inside a regex literal', () => {
    const source = 'await page.waitForURL(/\\/compress\\/?(?:\\?.*)?$/);';
    expect(specRouteViolation('src/tools/merge/e2e/merge-handoff.spec.js', source, routeMap))
      .toEqual([{ route: '/compress', owner: 'compress' }]);
  });

  it('ignores a route mentioned only in a comment', () => {
    const source = [
      '// This spec used to also drive /redact before DEBT-01 moved it out.',
      "await page.goto('/sign');",
    ].join('\n');
    expect(specRouteViolation('src/tools/sign/e2e/sign-editor.spec.js', source, routeMap)).toEqual([]);
  });
});

describe('rule 9: scriptSrcSpecifiers() finds a layout\'s <script src="...">', () => {
  it('finds a relative src', () => {
    expect(scriptSrcSpecifiers('<script src="../site-lib/homeWorkspace.ts"></script>'))
      .toEqual(['../site-lib/homeWorkspace.ts']);
  });

  it('finds a root-relative src', () => {
    expect(scriptSrcSpecifiers('<script src="/js/foo.ts"></script>')).toEqual(['/js/foo.ts']);
  });

  it('ignores an external/absolute src', () => {
    expect(scriptSrcSpecifiers('<script src="https://example.com/x.js"></script>')).toEqual([]);
  });

  it('ignores an inline script with no src', () => {
    expect(scriptSrcSpecifiers('<script>console.log("hi");</script>')).toEqual([]);
  });

  it('finds more than one tag in the same file', () => {
    const source = '<script src="./a.ts"></script>\n<div/>\n<script type="module" src="./b.ts"></script>';
    expect(scriptSrcSpecifiers(source)).toEqual(['./a.ts', './b.ts']);
  });
});

describe('rule 9: commonLayerConsumers() - two or more distinct tool/site consumers', () => {
  // Small literal reverse-edge maps ("who imports me", target -> Set of
  // importers), the same "not the real src/pages/ derivation" style rule
  // 7's routeMap uses above - classify() still does the real work, these
  // paths are just real enough for it to recognize.
  function reverseGraph(pairs) {
    const map = new Map();
    for (const [to, from] of pairs) {
      if (!map.has(to)) map.set(to, new Set());
      map.get(to).add(from);
    }
    return map;
  }

  it('a module nothing imports has zero consumers (the zero-consumer fixture)', () => {
    const graph = reverseGraph([]);
    expect(commonLayerConsumers('src/lib/orphan.js', graph)).toEqual(new Set());
  });

  it('a module one tool imports has exactly one consumer (the single-consumer fixture)', () => {
    const graph = reverseGraph([
      ['src/lib/single.js', 'src/tools/merge/PdfMergeTool.tsx'],
    ]);
    expect(commonLayerConsumers('src/lib/single.js', graph)).toEqual(new Set(['tool:merge']));
  });

  it('two different tools both count, distinctly', () => {
    const graph = reverseGraph([
      ['src/lib/shared.js', 'src/tools/merge/PdfMergeTool.tsx'],
      ['src/lib/shared.js', 'src/tools/sign/PdfSignTool.tsx'],
    ]);
    expect(commonLayerConsumers('src/lib/shared.js', graph)).toEqual(new Set(['tool:merge', 'tool:sign']));
  });

  it('the same tool importing from two of its own files is still one consumer', () => {
    const graph = reverseGraph([
      ['src/lib/shared.js', 'src/tools/merge/PdfMergeTool.tsx'],
      ['src/lib/shared.js', 'src/tools/merge/mergePlan.ts'],
    ]);
    expect(commonLayerConsumers('src/lib/shared.js', graph)).toEqual(new Set(['tool:merge']));
  });

  it('a chain through another common-layer module still counts, credited to the tool that reaches it (lib -> lib -> tool)', () => {
    const graph = reverseGraph([
      ['src/lib/inner.js', 'src/lib/outer.js'],
      ['src/lib/outer.js', 'src/tools/merge/PdfMergeTool.tsx'],
      ['src/lib/outer.js', 'src/tools/sign/PdfSignTool.tsx'],
    ]);
    expect(commonLayerConsumers('src/lib/inner.js', graph)).toEqual(new Set(['tool:merge', 'tool:sign']));
  });

  it('editor is special: an editor module reached only through editor-ui counts via the tools that reach editor-ui', () => {
    const graph = reverseGraph([
      ['src/editor/registry/renderers.ts', 'src/editor-ui/ElementToolbar.tsx'],
      ['src/editor-ui/ElementToolbar.tsx', 'src/tools/sign/PdfSignTool.tsx'],
      ['src/editor-ui/ElementToolbar.tsx', 'src/tools/redact/PdfRedactTool.tsx'],
    ]);
    expect(commonLayerConsumers('src/editor/registry/renderers.ts', graph))
      .toEqual(new Set(['tool:sign', 'tool:redact']));
  });

  it('two different site files reached through a chain both credit the same "site" identity, not two (ARCH-26)', () => {
    const graph = reverseGraph([
      ['src/site-lib/homeWorkspace.ts', 'src/layouts/HomePageLayout.astro'],
      ['src/layouts/HomePageLayout.astro', 'src/pages/index.astro'],
    ]);
    const consumers = commonLayerConsumers('src/site-lib/homeWorkspace.ts', graph);
    expect(consumers).toEqual(new Set(['site']));
    expect(consumers.size).toBe(1);
  });

  it('two site files directly importing a common module still count as one consumer, so the module fails the two-consumer rule alone (ARCH-26)', () => {
    const graph = reverseGraph([
      ['src/lib/siteOnly.js', 'src/pages/index.astro'],
      ['src/lib/siteOnly.js', 'src/layouts/BaseLayout.astro'],
    ]);
    const consumers = commonLayerConsumers('src/lib/siteOnly.js', graph);
    expect(consumers).toEqual(new Set(['site']));
    expect(consumers.size).toBeLessThan(2);
  });

  it('one site file plus one tool is two distinct consumers (site counts once, the tool counts once, together they pass)', () => {
    const graph = reverseGraph([
      ['src/lib/maintenanceTelemetry.ts', 'src/layouts/BaseLayout.astro'],
      ['src/lib/maintenanceTelemetry.ts', 'src/tools/sign/PdfSignTool.tsx'],
    ]);
    const consumers = commonLayerConsumers('src/lib/maintenanceTelemetry.ts', graph);
    expect(consumers).toEqual(new Set(['site', 'tool:sign']));
    expect(consumers.size).toBeGreaterThanOrEqual(2);
  });

  it('i18n and data modules count as site too, crediting the same single identity', () => {
    const graph = reverseGraph([
      ['src/lib/platform.ts', 'src/i18n/toolMessages.ts'],
      ['src/lib/platform.ts', 'src/tools/merge/PdfMergeTool.tsx'],
    ]);
    expect(commonLayerConsumers('src/lib/platform.ts', graph))
      .toEqual(new Set(['site', 'tool:merge']));
  });

  it('a dead end (components, test-support, unclassified) is not counted and not walked past', () => {
    const graph = reverseGraph([
      ['src/lib/onlyComponents.js', 'src/components/HeroDemo/ScrollDriver.tsx'],
      ['src/components/HeroDemo/ScrollDriver.tsx', 'src/tools/merge/PdfMergeTool.tsx'], // would count if walked past
      ['src/lib/onlyTest.js', 'src/test/setup.js'],
      ['src/test/setup.js', 'src/tools/sign/PdfSignTool.tsx'], // would count if walked past
    ]);
    expect(commonLayerConsumers('src/lib/onlyComponents.js', graph)).toEqual(new Set());
    expect(commonLayerConsumers('src/lib/onlyTest.js', graph)).toEqual(new Set());
  });
});

describe('rule 9: commonLayerConsumerViolations() on the real tree', () => {
  it('is green: every shell/editor-ui/lib module has two or more consumers', () => {
    expect(commonLayerConsumerViolations()).toEqual([]);
  });

  it('never flags an editor module: editor is out of rule 9\'s scope entirely', () => {
    const flaggedEditorFiles = commonLayerConsumerViolations().filter((v) => v.module === 'editor');
    expect(flaggedEditorFiles).toEqual([]);
  });

  it('a real single-consumer editor module is not flagged (editor is out of scope, not merely allowed a pass)', () => {
    // src/editor/adapters/pdf/sign.js is Sign's own PDF export/signing
    // adapter: genuinely one tool's worth of consumer (tool:sign), the same
    // shape rule 9 would flag in shell/editor-ui/lib. It stays unflagged
    // because classify() puts it in 'editor', which commonLayerConsumerViolations()
    // no longer checks at all - not because of a per-file exception.
    const { edges } = buildEdges();
    const allEdges = [...edges, ...astroScriptSrcEdges()];
    const reverseEdges = new Map();
    for (const { from, to } of allEdges) {
      if (!reverseEdges.has(to)) reverseEdges.set(to, new Set());
      reverseEdges.get(to).add(from);
    }
    const target = 'src/editor/adapters/pdf/sign.js';
    expect(classify(target)).toBe('editor');
    expect(commonLayerConsumers(target, reverseEdges).size).toBe(1);
    expect(commonLayerConsumerViolations().some((v) => v.file === target)).toBe(false);
  });

  it('SignatureDialog.tsx is no longer in editor-ui to check (ARCH-25 moved it into src/tools/sign/)', () => {
    const stillThere = commonLayerConsumerViolations().some((v) => v.file.includes('SignatureDialog'));
    expect(stillThere).toBe(false);
  });

  it('the <script src="..."> pass is load-bearing: without it, src/site-lib/homeWorkspace.ts would read as zero-consumer; with it, the site counts once (ARCH-26, not "counted as two")', () => {
    const { edges } = buildEdges();
    const withoutScriptSrc = new Map();
    for (const { from, to } of edges) {
      if (!withoutScriptSrc.has(to)) withoutScriptSrc.set(to, new Set());
      withoutScriptSrc.get(to).add(from);
    }
    expect(commonLayerConsumers('src/site-lib/homeWorkspace.ts', withoutScriptSrc)).toEqual(new Set());

    const withScriptSrc = new Map();
    for (const { from, to } of [...edges, ...astroScriptSrcEdges()]) {
      if (!withScriptSrc.has(to)) withScriptSrc.set(to, new Set());
      withScriptSrc.get(to).add(from);
    }
    // Before ARCH-26 this pinned "counted as two" (the layout and the page it
    // renders through each credited their own path). Now every site file -
    // the layout, the page, and homeWorkspace.ts's own new home in
    // src/site-lib/ once the chain reaches it - shares the single `site`
    // identity, so the real tree gives exactly one consumer, not two.
    expect(commonLayerConsumers('src/site-lib/homeWorkspace.ts', withScriptSrc)).toEqual(new Set(['site']));
  });
});
