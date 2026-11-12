import { describe, expect, it } from 'vitest';
import { findWastedSheets, planSheets, rewritePage, ruleKeys } from './linkClientSheets.mjs';

const keys = (...rules) => new Set(rules);
const sheets = {
  '/shared/a.css': keys('.a{x:1}', '.b{x:2}'),
  '/shared/b.css': keys('.c{x:3}'),
  '/shared/client.css': keys('.a{x:1}', '.b{x:2}', '.z{x:9}'),
  '/shared/partial.css': keys('.c{x:3}', '.q{x:7}'),
};
const keysOf = (url) => sheets[url];
const link = (href) => `<link rel="stylesheet" href="${href}">`;

describe('ruleKeys', () => {
  it('lists each rule once, with the at-rule around it', () => {
    expect(ruleKeys('.a{x:1}@media (min-width:1px){.b{x:2}.c{y:3}}')).toEqual(new Set(['.a{x:1}', '@media (min-width:1px){.b{x:2}', '@media (min-width:1px){.c{y:3}']));
  });
  it('ignores comments and whitespace between rules', () => {
    expect(ruleKeys('/* c */ .a{x:1}\n.b{x:2} ')).toEqual(new Set(['.a{x:1}', '.b{x:2}']));
  });
});

describe('planSheets', () => {
  it('links a client sheet that holds every rule of a linked one, and drops the linked one', () => {
    expect(planSheets(['/shared/a.css', '/shared/b.css'], ['/shared/client.css'], keysOf)).toEqual({ add: ['/shared/client.css'], drop: ['/shared/a.css'] });
  });
  it('leaves a client sheet alone when it holds no linked sheet whole', () => {
    expect(planSheets(['/shared/a.css'], ['/shared/partial.css'], keysOf)).toEqual({ add: [], drop: [] });
  });
  it('never links two client sheets to replace one linked sheet', () => {
    const k = (url) => ({ '/shared/l.css': keys('.a{x:1}'), '/shared/c1.css': keys('.a{x:1}'), '/shared/c2.css': keys('.a{x:1}') })[url];
    expect(planSheets(['/shared/l.css'], ['/shared/c1.css', '/shared/c2.css'], k)).toEqual({ add: ['/shared/c1.css'], drop: ['/shared/l.css'] });
  });
});

describe('rewritePage', () => {
  it('drops the covered links and adds the client ones after the last stylesheet link', () => {
    const html = `<head>${link('/shared/a.css')}${link('/shared/b.css')}<style>p{}</style></head>`;
    expect(rewritePage(html, { add: ['/shared/client.css'], drop: ['/shared/a.css'] })).toBe(`<head>${link('/shared/b.css')}${link('/shared/client.css')}<style>p{}</style></head>`);
  });
  it('returns the page unchanged for an empty plan', () => {
    const html = `<head>${link('/shared/a.css')}</head>`;
    expect(rewritePage(html, { add: [], drop: [] })).toBe(html);
  });
});

describe('findWastedSheets', () => {
  it('names a client sheet the page does not link whose rules its linked sheets already hold', () => {
    expect(findWastedSheets(['/shared/a.css', '/shared/b.css'], ['/shared/c.css'], (u) => (u === '/shared/c.css' ? keys('.a{x:1}', '.c{x:3}') : sheets[u]))).toEqual(['/shared/c.css']);
  });
  it('passes a client sheet with a rule the linked sheets lack', () => {
    expect(findWastedSheets(['/shared/a.css'], ['/shared/partial.css'], keysOf)).toEqual([]);
  });
});
