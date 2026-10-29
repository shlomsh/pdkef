import { describe, expect, it } from 'vitest';
import { pageCssBlocks } from './pageCss.mjs';

describe('pageCssBlocks (MEM-27)', () => {
  const sheets = { '/shared/tool-abc123.css': '.tool{gap:0}' };
  const read = (href) => sheets[href];

  it('returns inline blocks and linked stylesheets in document order', () => {
    const html = '<head><style>.a{}</style><link rel="stylesheet" href="/shared/tool-abc123.css"><style>.b{}</style></head>';
    expect(pageCssBlocks(html, read)).toEqual([
      { href: null, css: '.a{}' },
      { href: '/shared/tool-abc123.css', css: '.tool{gap:0}' },
      { href: null, css: '.b{}' },
    ]);
  });
  it('skips links that are not same-origin stylesheets', () => {
    const html = '<link rel="preload" href="/shared/tool-abc123.css" as="style"><link rel="icon" href="/x.svg"><link rel="stylesheet" href="https://fonts.example/a.css">';
    expect(pageCssBlocks(html, read)).toEqual([]);
  });
  it('skips sheets inside <noscript>, which a page with JS never applies', () => {
    const html = '<noscript><link rel="stylesheet" href="/shared/tool-abc123.css"><style>.n{}</style></noscript><style>.a{}</style>';
    expect(pageCssBlocks(html, read)).toEqual([{ href: null, css: '.a{}' }]);
  });
  it('reads a linked sheet with a query string and skips a protocol-relative one', () => {
    const html = '<link rel="stylesheet" href="/shared/tool-abc123.css?v=2"><link rel="stylesheet" href="//cdn.example/x.css">';
    expect(pageCssBlocks(html, read)).toEqual([{ href: '/shared/tool-abc123.css', css: '.tool{gap:0}' }]);
  });
});

