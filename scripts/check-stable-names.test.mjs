import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { findMissingClassRules, findStableNameProblems, moduleClasses } from './check-stable-names.mjs';
import { cssModuleClassName } from './stableNames.mjs';

const page = (body) => `<html><head>${body}</head><body></body></html>`;
const good = { pages: { 'sign/index.html': page('<script type="module" src="/site/boot.js"></script><astro-island component-url="/site/PdfSignTool.js" renderer-url="/site/client.js"></astro-island>') }, site: ['boot.js', 'PdfSignTool.js', 'client.js'], shared: ['openPdfDoc.js', 'maintenanceTelemetry.js', 'PageGrid.css'], astro: ['pdf-lib.AbCd1234.js', 'logo.AbCd1234.svg'], hot: ['openPdfDoc', 'maintenanceTelemetry'] };

describe('findStableNameProblems', () => {
  it('passes a build whose pages name only /site/ entries and whose hot chunks exist', () => {
    expect(findStableNameProblems(good)).toEqual([]);
  });
  it('names the page and URL of a hashed script src', () => {
    const f = findStableNameProblems({ ...good, pages: { 'he/index.html': page('<script type="module" src="/_astro/boot.AbC123xy.js"></script>') } });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('he/index.html');
    expect(f[0]).toContain('/_astro/boot.AbC123xy.js');
    expect(f[0]).toContain('MEM-25');
  });
  it('names a hashed component-url and renderer-url', () => {
    const f = findStableNameProblems({ ...good, pages: { 'a/index.html': page('<astro-island component-url="/_astro/PdfX.Zz9.js" renderer-url="/_astro/client.Q.js"></astro-island>') } });
    expect(f).toHaveLength(2);
    expect(f[0]).toContain('/_astro/PdfX.Zz9.js');
    expect(f[1]).toContain('/_astro/client.Q.js');
  });
  it('names a hashed modulepreload and before-hydration-url', () => {
    const f = findStableNameProblems({ ...good, pages: { 'a/index.html': page('<link rel="modulepreload" href="/_astro/preact.AbCd1234.js"><astro-island before-hydration-url="/_astro/hyd.AbCd1234.js"></astro-island>') } });
    expect(f).toHaveLength(2);
    expect(f[0]).toContain('modulepreload /_astro/preact.AbCd1234.js');
    expect(f[1]).toContain('before-hydration-url /_astro/hyd.AbCd1234.js');
  });
  it('names a hot shared chunk with no dist/shared file', () => {
    const f = findStableNameProblems({ ...good, shared: ['openPdfDoc.js'] });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('maintenanceTelemetry');
    expect(f[0]).toContain('dist/shared/maintenanceTelemetry.js');
  });
  it('names a content-hashed file in dist/site or dist/shared', () => {
    const f = findStableNameProblems({ ...good, site: [...good.site, 'util.AbCdEf12.js'], shared: [...good.shared, 'x.0123456789.js'] });
    expect(f).toHaveLength(2);
    expect(f[0]).toContain('site/util.AbCdEf12.js');
    expect(f[1]).toContain('shared/x.0123456789.js');
  });
  it('names any inner dot in dist/site or dist/shared, whatever the hash length', () => {
    const f = findStableNameProblems({ ...good, site: [...good.site, 'BaseLayout.astro_astro_type_script_index_1_lang.js'], shared: [...good.shared, 'x.Q.js'] });
    expect(f).toHaveLength(2);
    expect(f[1]).toContain('shared/x.Q.js');
  });
  it('lets underscored and dashed stable names through', () => {
    expect(findStableNameProblems({ ...good, site: [...good.site, 'BaseLayout_astro_astro_type_script_index_1_lang.js', 'pdf-lib@1.js'] })).toEqual([]);
  });
  it('names a content-hashed CSS file in dist/_astro or dist/shared (MEM-26)', () => {
    const f = findStableNameProblems({ ...good, astro: [...good.astro, 'PageGrid.AbCd1234.css'], shared: [...good.shared, 'x.AbCd1234.css'] });
    expect(f).toHaveLength(2);
    expect(f[0]).toContain('_astro/PageGrid.AbCd1234.css');
    expect(f[1]).toContain('shared/x.AbCd1234.css');
  });
});

describe('moduleClasses and findMissingClassRules (MEM-26)', () => {
  const file = path.resolve('src/x/Panel.module.css');
  const token = (name) => cssModuleClassName(name, file);
  const classes = moduleClasses([{ file, css: '/* .ghost {} */\n.panel { padding: 1rem; }\n.wrap { composes: panel; }\n@media (width < 40em) { .panel-wide { gap: 0; } }\n' }]);

  it('lists every class and marks the composes-only ones', () => {
    expect([...classes.all].sort()).toEqual([token('panel'), token('panel-wide'), token('wrap')].sort());
    expect([...classes.ruleless]).toEqual([token('wrap')]);
  });
  it('passes a page whose CSS carries every class its code renders', () => {
    const css = `.${token('panel')}{padding:1rem}.${token('panel-wide')}{gap:0}`;
    expect(findMissingClassRules({ pages: [{ page: 'a/index.html', js: `({panel:"${token('panel')}",wrap:"${token('wrap')} ${token('panel')}","panel-wide":"${token('panel-wide')}"})`, css }], classes })).toEqual([]);
  });
  it('names the page and the class whose rule is missing', () => {
    const f = findMissingClassRules({ pages: [{ page: 'a/index.html', js: `"${token('panel')} ${token('panel-wide')}"`, css: `.${token('panel')}{padding:1rem}` }], classes });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('a/index.html');
    expect(f[0]).toContain(token('panel-wide'));
  });
});
