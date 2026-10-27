import { afterEach, describe, expect, it, vi } from 'vitest';

// next() from @vercel/functions returns a Response carrying the extra headers, which is all this test reads.
vi.mock('@vercel/functions', () => ({
  next: (init?: { headers?: Headers }) => new Response('page', { headers: init?.headers }),
}));

import middleware from '../../middleware.ts';

const page = () => new Request('https://pdkef.com/merge/', { headers: { accept: 'text/html' } });

afterEach(() => vi.unstubAllEnvs());

describe('middleware build header (MEM-19)', () => {
  it('sends the deploying commit as Server-Timing on an HTML page', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'f27c2b71' + 'a'.repeat(32));
    const res = await middleware(page());
    expect(res.headers.get('server-timing')).toBe('build;desc="f27c2b7"');
    expect(res.headers.get('vary')).toBe('Accept, Accept-Encoding');
  });
  it('sends none when the deploy has no commit', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    const res = await middleware(page());
    expect(res.headers.has('server-timing')).toBe(false);
    expect(res.headers.get('vary')).toBe('Accept, Accept-Encoding');
  });

  describe('other branches', () => {
    const sha = 'f27c2b71' + 'a'.repeat(32);
    const withAccept = (path: string, accept: string) =>
      new Request(`https://pdkef.com${path}`, { headers: { accept } });

    it('sends Server-Timing on a markdown-preferred passthrough (a non-slash redirect source)', async () => {
      vi.stubEnv('VERCEL_GIT_COMMIT_SHA', sha);
      const res = await middleware(withAccept('/merge', 'text/markdown'));
      expect(res.headers.get('server-timing')).toBe('build;desc="f27c2b7"');
    });
    it('sends none on a markdown response', async () => {
      vi.stubEnv('VERCEL_GIT_COMMIT_SHA', sha);
      vi.stubGlobal('fetch', vi.fn(async () => new Response('# Merge', { status: 200 })));
      const res = await middleware(withAccept('/merge/', 'text/markdown'));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/markdown');
      expect(res.headers.has('server-timing')).toBe(false);
      vi.unstubAllGlobals();
    });
    it('sends none on the 406', async () => {
      vi.stubEnv('VERCEL_GIT_COMMIT_SHA', sha);
      const res = await middleware(withAccept('/merge/', 'application/json'));
      expect(res.status).toBe(406);
      expect(res.headers.has('server-timing')).toBe(false);
    });
  });
});
