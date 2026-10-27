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
});
