import { describe, expect, it } from 'vitest';
import {
  evaluatedModules,
  findBadIslandExports,
  findDanglingRefs,
  findStubScripts,
  isImportStub,
  isReexportStub,
  rewritePage,
  verifyDist,
} from './dropStubRequests.mjs';

const SITE = '/shared/site.js';
const stubs = new Map([
  ['/site/a.js', { target: SITE }],
  ['/site/b.js', { target: SITE }],
  ['/site/c.js', { target: '/shared/other.js' }],
  ['/site/Tool.js', { target: '/shared/sign-tool.js', exportName: 't' }],
]);
const script = (src) => `<script type="module" src="${src}"></script>`;

describe('isImportStub', () => {
  it('names the one module a lone import loads', () => {
    expect(isImportStub('import"../shared/site.js";')).toBe('../shared/site.js');
    expect(isImportStub('import "../shared/site.js"\n')).toBe('../shared/site.js');
    expect(isImportStub("import '../shared/site.js';")).toBe('../shared/site.js');
  });
  it('is not a stub when anything else is in the file', () => {
    expect(isImportStub('import"./x.js";console.log(1);')).toBeNull();
    expect(isImportStub('import"./x.js";export{a};')).toBeNull();
    expect(isImportStub('const a=1;import"./x.js";')).toBeNull();
  });
  it('is not a stub with two imports, bindings, or a dynamic import', () => {
    expect(isImportStub('import"./x.js";import"./y.js";')).toBeNull();
    expect(isImportStub('import{a}from"./x.js";')).toBeNull();
    expect(isImportStub('import("./x.js");')).toBeNull();
  });
  it('ignores a trailing source map comment only', () => {
    expect(isImportStub('import"./x.js";\n//# sourceMappingURL=x.js.map')).toBe('./x.js');
  });
});

describe('isReexportStub', () => {
  it('reads the chunk target and the name the chunk exports the default as', () => {
    expect(isReexportStub('export{t as default}from"../shared/sign-tool.js";')).toEqual({ target: '../shared/sign-tool.js', exportName: 't' });
    expect(isReexportStub('export { default } from "./x.js"')).toEqual({ target: './x.js', exportName: 'default' });
  });
  it('takes the default out of a re-export of several names', () => {
    expect(isReexportStub('export{n as LAUNCHER,t as default,r as isolate}from"../shared/home.js";')).toEqual({ target: '../shared/home.js', exportName: 't' });
  });
  it('is not a stub without a default, or with another statement', () => {
    expect(isReexportStub('export{a,b}from"./x.js";')).toBeNull();
    expect(isReexportStub('export{t as default}from"./x.js";import"./y.js";')).toBeNull();
    expect(isReexportStub('export{t as other}from"./x.js";')).toBeNull();
    expect(isReexportStub('export*from"./x.js";')).toBeNull();
    expect(isReexportStub('export{a as default};')).toBeNull();
  });
});

describe('rewritePage: module scripts', () => {
  it('points a stub script at its target', () => {
    const out = rewritePage(`<body>${script('/site/a.js')}</body>`, stubs);
    expect(out.html).toBe(`<body>${script(SITE)}</body>`);
    expect(out.removed).toEqual(['/site/a.js']);
  });
  it('collapses duplicate targets to one tag, in the first-seen position', () => {
    const html = `${script('/site/a.js')}<p>x</p>${script('/site/c.js')}${script('/site/b.js')}`;
    const out = rewritePage(html, stubs);
    expect(out.html).toBe(`${script(SITE)}<p>x</p>${script('/shared/other.js')}`);
    expect(out.removed).toEqual(['/site/a.js', '/site/c.js', '/site/b.js']);
  });
  it('drops a stub whose target a real script on the page already names, and keeps that script', () => {
    const html = `${script(SITE)}${script('/site/a.js')}`;
    expect(rewritePage(html, stubs).html).toBe(script(SITE));
    const later = `${script('/site/a.js')}${script(SITE)}`;
    expect(rewritePage(later, stubs).html).toBe(script(SITE));
  });
  it('keeps exactly one tag for a target nothing else loads', () => {
    const out = rewritePage(`${script('/site/c.js')}`, stubs);
    expect(out.html.match(/<script/g)).toHaveLength(1);
    expect(out.html).toContain('src="/shared/other.js"');
  });
  it('leaves scripts that are not stubs, and non-module scripts, alone', () => {
    const html = `${script('/site/real.js')}<script src="/site/a.js"></script><script type="module">import"/site/a.js"</script>`;
    const out = rewritePage(html, stubs);
    expect(out.html).toBe(html);
    expect(out.removed).toEqual([]);
  });
  it('handles attribute order, single quotes and extra attributes without losing them', () => {
    expect(rewritePage(`<script src="/site/a.js" type="module"></script>`, stubs).html).toBe(`<script src="${SITE}" type="module"></script>`);
    expect(rewritePage(`<script type='module' src='/site/a.js'></script>`, stubs).html).toBe(`<script type='module' src='${SITE}'></script>`);
    expect(rewritePage(`<script type="module" crossorigin src="/site/a.js"></script>`, stubs).html).toBe(`<script type="module" crossorigin src="${SITE}"></script>`);
  });
  it('returns HTML with no stubs byte-identical', () => {
    const html = `<!doctype html><html><body>${script('/site/real.js')}<astro-island component-url="/site/real.js" component-export="default"></astro-island></body></html>`;
    const out = rewritePage(html, stubs);
    expect(out.html).toBe(html);
    expect(out.removed).toEqual([]);
  });
});

describe('rewritePage: islands', () => {
  it('points component-url at the chunk and component-export at its own export name', () => {
    const html = '<astro-island uid="x" component-url="/site/Tool.js" component-export="default" renderer-url="/site/client.js" ssr></astro-island>';
    const out = rewritePage(html, stubs);
    expect(out.html).toBe('<astro-island uid="x" component-url="/shared/sign-tool.js" component-export="t" renderer-url="/site/client.js" ssr></astro-island>');
    expect(out.removed).toEqual(['/site/Tool.js']);
  });
  it('handles either attribute order, single quotes, and a missing component-export (default)', () => {
    expect(rewritePage(`<astro-island component-export="default" component-url="/site/Tool.js"></astro-island>`, stubs).html)
      .toBe(`<astro-island component-export="t" component-url="/shared/sign-tool.js"></astro-island>`);
    expect(rewritePage(`<astro-island component-url='/site/Tool.js' component-export='default'></astro-island>`, stubs).html)
      .toBe(`<astro-island component-url='/shared/sign-tool.js' component-export='t'></astro-island>`);
    expect(rewritePage(`<astro-island component-url="/site/Tool.js" ssr></astro-island>`, stubs).html)
      .toBe(`<astro-island component-url="/shared/sign-tool.js" ssr component-export="t"></astro-island>`);
  });
  it('leaves an island alone when it asks for a named export, or its url is not a re-export stub', () => {
    const named = '<astro-island component-url="/site/Tool.js" component-export="Other"></astro-island>';
    expect(rewritePage(named, stubs).html).toBe(named);
    const sideEffect = '<astro-island component-url="/site/a.js" component-export="default"></astro-island>';
    expect(rewritePage(sideEffect, stubs).html).toBe(sideEffect);
  });
  it('counts a stub once per page even when several islands use it', () => {
    const island = '<astro-island component-url="/site/Tool.js" component-export="default"></astro-island>';
    expect(rewritePage(island + island, stubs).removed).toEqual(['/site/Tool.js']);
  });
});

describe('evaluatedModules', () => {
  it('lists the distinct modules the scripts evaluate, stubs resolved, in order', () => {
    const html = `${script('/site/c.js')}${script('/site/a.js')}${script(SITE)}${script('/site/b.js')}<astro-island component-url="/site/Tool.js" component-export="default"></astro-island>`;
    expect(evaluatedModules(html, stubs)).toEqual({ scripts: ['/shared/other.js', SITE], islands: ['/shared/sign-tool.js'] });
  });
  it('is the same before and after rewritePage', () => {
    const html = `${script('/site/c.js')}${script('/site/a.js')}${script('/site/b.js')}<astro-island component-url="/site/Tool.js" component-export="default"></astro-island>`;
    expect(evaluatedModules(rewritePage(html, stubs).html, stubs)).toEqual(evaluatedModules(html, stubs));
  });
});

// A small dist: pages, the code of each .js file, and every URL that exists.
const view = ({ pages, code = {}, extra = [] }) => ({
  pages: new Map(Object.entries(pages)),
  code: new Map(Object.entries(code)),
  urls: new Set([...Object.keys(code), ...extra]),
});

describe('findDanglingRefs', () => {
  it('names a page URL that points at a file that does not exist', () => {
    const v = view({ pages: { '/': `${script('/site/gone.js')}<link rel="stylesheet" href="/shared/x.css">` }, code: { '/shared/site.js': '' } });
    const problems = findDanglingRefs(v);
    expect(problems).toHaveLength(2);
    expect(problems.join()).toContain('/site/gone.js');
    expect(problems.join()).toContain('/shared/x.css');
  });
  it('passes when every referenced file exists, island urls included', () => {
    const v = view({ pages: { '/': `${script(SITE)}<astro-island component-url="/shared/t.js" renderer-url="/site/client.js"></astro-island>` }, code: { [SITE]: '', '/shared/t.js': '', '/site/client.js': '' } });
    expect(findDanglingRefs(v)).toEqual([]);
  });
});

describe('findStubScripts', () => {
  it('names a module script that still points at a pure import stub', () => {
    const v = view({ pages: { '/': script('/site/a.js') }, code: { '/site/a.js': `import"../shared/site.js";`, [SITE]: 'export{};' } });
    expect(findStubScripts(v)[0]).toContain('/site/a.js');
  });
  it('passes for a script with real code, including one that imports and does more', () => {
    const v = view({ pages: { '/': script('/site/a.js') + script('/site/b.js') }, code: { '/site/a.js': 'import"./x.js";run();', '/site/b.js': 'run();' } });
    expect(findStubScripts(v)).toEqual([]);
  });
});

describe('findBadIslandExports', () => {
  const island = (url, exp) => `<astro-island component-url="${url}" component-export="${exp}"></astro-island>`;
  it('passes when the chunk exports the name', () => {
    const v = view({ pages: { '/': island('/shared/t.js', 't') + island('/shared/u.js', 'default') + island('/shared/w.js', 'W') }, code: {
      '/shared/t.js': 'const a=1;export{a as t,x as y};',
      '/shared/u.js': 'export default function(){}',
      '/shared/w.js': 'export function W(){}',
    } });
    expect(findBadIslandExports(v)).toEqual([]);
  });
  it('names an island whose component-export the chunk does not export, or whose file is missing', () => {
    const v = view({ pages: { '/': island('/shared/t.js', 'q') + island('/shared/none.js', 'default') }, code: { '/shared/t.js': 'export{a as t};' } });
    const problems = findBadIslandExports(v);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('"q"');
  });
});

describe('verifyDist', () => {
  const ok = view({ pages: { '/': script(SITE) }, code: { [SITE]: 'export{};' } });
  it('passes a clean dist that dropped a stub', () => {
    expect(verifyDist(ok, { removedCount: 3 })).toEqual([]);
  });
  it('fails a build where no stub was removed, saying the output shape changed', () => {
    const problems = verifyDist(ok, { removedCount: 0 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/shape/i);
  });
  it('gathers every kind of problem', () => {
    const bad = view({ pages: { '/': script('/site/a.js') + script('/site/gone.js') }, code: { '/site/a.js': 'import"./x.js";' } });
    expect(verifyDist(bad, { removedCount: 1 }).length).toBeGreaterThanOrEqual(2);
  });
});
