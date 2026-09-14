import { describe, it, expect } from 'vitest';
import { acceptQuality, negotiateRepresentation, markdownRoute } from './acceptNegotiation.js';

describe('acceptQuality', () => {
  it('gives an exact type match q=1 when unqualified', () => {
    expect(acceptQuality('text/markdown', 'text/markdown')).toBe(1);
  });

  it('returns 0 when the target type is absent and no wildcard covers it', () => {
    expect(acceptQuality('application/json', 'text/markdown')).toBe(0);
    expect(acceptQuality('text/html', 'text/markdown')).toBe(0);
  });

  it('honors an explicit q-value', () => {
    expect(acceptQuality('text/markdown;q=0.5', 'text/markdown')).toBe(0.5);
  });

  it('picks the higher of two q-values for the same exact type', () => {
    expect(acceptQuality('text/markdown;q=0.3, text/markdown;q=0.9', 'text/markdown')).toBe(0.9);
  });

  it('falls back to a type/* wildcard when no exact entry exists', () => {
    expect(acceptQuality('text/*;q=0.7', 'text/markdown')).toBe(0.7);
  });

  it('falls back to */* when neither an exact nor a type/* entry exists', () => {
    expect(acceptQuality('*/*;q=0.8', 'text/markdown')).toBe(0.8);
  });

  it('prefers an exact match over a type/* or */* entry even at a lower q', () => {
    // RFC 9110 12.5.1: the most specific reference has precedence.
    expect(acceptQuality('text/markdown;q=0.4, text/*;q=0.9, */*;q=1', 'text/markdown')).toBe(0.4);
    expect(acceptQuality('text/*;q=0.4, */*;q=1', 'text/markdown')).toBe(0.4);
  });

  it('reproduces a typical browser Accept header: HTML wins over the trailing */*', () => {
    const browserAccept = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
    expect(acceptQuality(browserAccept, 'text/html')).toBe(1);
    expect(acceptQuality(browserAccept, 'text/markdown')).toBe(0.8);
  });

  it('reproduces an agent explicitly preferring markdown over html', () => {
    const agentAccept = 'text/markdown, text/html;q=0.9';
    expect(acceptQuality(agentAccept, 'text/markdown')).toBe(1);
    expect(acceptQuality(agentAccept, 'text/html')).toBe(0.9);
  });

  it('ignores parameters other than q', () => {
    expect(acceptQuality('text/markdown;charset=utf-8;q=0.6', 'text/markdown')).toBe(0.6);
  });

  it('ignores a non-numeric q value rather than throwing', () => {
    expect(acceptQuality('text/markdown;q=not-a-number', 'text/markdown')).toBe(1);
  });
});

describe('negotiateRepresentation', () => {
  // The production bug this guards: */* is curl's own default Accept header
  // (sent with no -H at all), and it matches text/markdown exactly as well as
  // text/html. That tie must resolve to HTML, or every plain curl and every
  // crawler with an unspecific Accept gets Markdown instead of the page.
  it('resolves a bare */* (curl default) to HTML, not Markdown', () => {
    expect(negotiateRepresentation('*/*')).toBe('html');
  });

  it('resolves an absent Accept header to HTML', () => {
    expect(negotiateRepresentation(null)).toBe('html');
    expect(negotiateRepresentation('')).toBe('html');
  });

  it('resolves an explicit tie between the two types to HTML', () => {
    expect(negotiateRepresentation('text/markdown, text/html')).toBe('html');
    expect(negotiateRepresentation('text/*')).toBe('html');
  });

  it('resolves a typical browser Accept header to HTML', () => {
    expect(
      negotiateRepresentation('text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'),
    ).toBe('html');
  });

  it('serves Markdown only when it is strictly preferred over HTML', () => {
    expect(negotiateRepresentation('text/markdown')).toBe('markdown');
    expect(negotiateRepresentation('text/markdown, text/html;q=0.9')).toBe('markdown');
    expect(negotiateRepresentation('text/markdown, */*;q=0.1')).toBe('markdown');
  });

  it('keeps HTML when it is preferred, even with Markdown also listed', () => {
    expect(negotiateRepresentation('text/html, text/markdown;q=0.5')).toBe('html');
  });

  it('reports an Accept that names neither representation as unacceptable (406)', () => {
    expect(negotiateRepresentation('application/json')).toBe('unacceptable');
    expect(negotiateRepresentation('image/webp, image/png;q=0.9')).toBe('unacceptable');
  });

  it('does not treat an explicit q=0 on both types as acceptable', () => {
    expect(negotiateRepresentation('text/html;q=0, text/markdown;q=0, */*')).toBe('unacceptable');
  });
});

describe('markdownRoute', () => {
  const redirectSources = new Set(['/compress', '/remove-pages', '/remove-pages/']);

  it('maps the home page to /index.md', () => {
    expect(markdownRoute('/', redirectSources)).toEqual({ kind: 'markdown', path: '/index.md' });
  });

  it('maps a canonical trailing-slash path to its .md twin', () => {
    expect(markdownRoute('/compress/', redirectSources)).toEqual({ kind: 'markdown', path: '/compress.md' });
    expect(markdownRoute('/how-to-sign-a-pdf-on-mac/', redirectSources)).toEqual({
      kind: 'markdown',
      path: '/how-to-sign-a-pdf-on-mac.md',
    });
  });

  it('passes a non-slash path through when vercel.json has a redirect for it', () => {
    // A real route's non-slash form, and a retired route: both must reach
    // Vercel's redirect so the agent is sent to the canonical URL.
    expect(markdownRoute('/compress', redirectSources)).toEqual({ kind: 'passthrough' });
    expect(markdownRoute('/remove-pages', redirectSources)).toEqual({ kind: 'passthrough' });
  });

  it('reports a non-slash path with no redirect as not found', () => {
    // The scanner probe: curl .../some-path-that-does-not-exist (no slash).
    expect(markdownRoute('/some-path-that-does-not-exist', redirectSources)).toEqual({ kind: 'not-found' });
  });

  it('still routes a nonexistent trailing-slash path to a .md fetch (the fetch 404s)', () => {
    expect(markdownRoute('/nope/', redirectSources)).toEqual({ kind: 'markdown', path: '/nope.md' });
  });
});

describe('markdownRoute against the real vercel.json', () => {
  it('passes every real route non-slash form through and rejects a fake path', async () => {
    const { default: vercelConfig } = await import('../../vercel.json');
    const sources = new Set(vercelConfig.redirects.map((r) => r.source));
    expect(markdownRoute('/compress', sources)).toEqual({ kind: 'passthrough' });
    expect(markdownRoute('/about', sources)).toEqual({ kind: 'passthrough' });
    expect(markdownRoute('/some-path-that-does-not-exist', sources)).toEqual({ kind: 'not-found' });
  });
});
