import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST, GET } from '../../api/report.ts';

// The endpoint's whole contract with the person using a tool: whatever happens
// on our side - the store over quota, down, slow to answer garbage, or not
// configured - the reply is the same empty 204. A beacon never surfaces a
// response to the page, and the server must not give it one worth surfacing.
// Lives here, not beside the function: every .ts file under api/ deploys.

const body = JSON.stringify({ area: 'drafts', name: 'TypeError', frame: 'A.1b.js:1:2' });
const post = () => POST(new Request('https://pdkef.com/api/report', { method: 'POST', body }));

describe('/api/report stays silent', () => {
  beforeEach(() => {
    process.env.KV_REST_API_URL = 'https://store.invalid';
    process.env.KV_REST_API_TOKEN = 'test-token';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    vi.restoreAllMocks();
  });

  const failures = {
    'the store is over quota (429)': () => new Response('{"error":"max requests limit exceeded"}', { status: 429 }),
    'the store errors (500)': () => new Response('oops', { status: 500 }),
    'the store answers garbage': () => new Response('not json', { status: 200 }),
    'the network fails': () => Promise.reject(new TypeError('fetch failed')),
  };

  for (const [what, respond] of Object.entries(failures)) {
    it(`answers an empty 204 when ${what}`, async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(respond);
      const res = await post();
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      for (const call of console.error.mock.calls) expect(JSON.stringify(call)).not.toContain('A.1b.js');
    });
  }

  it('answers an empty 204 when the store is not configured, without calling out', async () => {
    delete process.env.KV_REST_API_URL;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await post();
    expect(res.status).toBe(204);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('answers an empty 204 to junk, and 405 only to a method no beacon uses', async () => {
    const junk = await POST(new Request('https://pdkef.com/api/report', { method: 'POST', body: '{' }));
    expect(junk.status).toBe(204);
    expect(GET().status).toBe(405);
  });
});
