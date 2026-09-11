import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tools } from './tools.js';
import { staticPages } from './staticPages.js';

const llmsTxt = fs.readFileSync(path.join(process.cwd(), 'public/llms.txt'), 'utf8');

// The llms.txt spec (llmstxt.org): an H1 is the only required section, and a
// blockquote summary must come right after it. Everything else is free-form,
// but these are the specific things HTTP-404-01/AGENT-01 added and rely on.
describe('public/llms.txt', () => {
  it('starts with an H1 title, then a blockquote summary', () => {
    const lines = llmsTxt.split('\n').map((l) => l.trim()).filter(Boolean);
    expect(lines[0]).toMatch(/^# /);
    expect(lines[1]).toMatch(/^> /);
  });

  it('has a "When to use this" section naming concrete use cases', () => {
    expect(llmsTxt).toMatch(/## When to use this/);
    expect(llmsTxt).toMatch(/no API/i);
  });

  it('links to every real tool page', () => {
    for (const tool of tools) {
      expect(llmsTxt).toContain(`https://pdkef.com${tool.href}`);
    }
  });

  it('links to every trust-anchor static page', () => {
    for (const page of staticPages) {
      expect(llmsTxt).toContain(`https://pdkef.com/${page.slug}/`);
    }
  });

  it('links to the sitemap and the source repository', () => {
    expect(llmsTxt).toContain('https://pdkef.com/sitemap.xml');
    expect(llmsTxt).toContain('https://github.com/shlomsh/pdkef');
  });

  it('every internal pdkef.com link is trailing-slash canonical or a known non-page file', () => {
    const internalLinks = [...llmsTxt.matchAll(/https:\/\/pdkef\.com(\/[^\s)]*)/g)].map((m) => m[1]);
    expect(internalLinks.length).toBeGreaterThan(0);
    for (const link of internalLinks) {
      const isCanonicalPage = link.endsWith('/');
      const isKnownFile = /\.(xml|md)$/.test(link);
      expect(isCanonicalPage || isKnownFile, `unexpected non-canonical internal link: ${link}`).toBe(true);
    }
  });
});
