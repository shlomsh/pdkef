import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST, GET } from '../../api/report.ts';

// The endpoint's whole contract with the person using a tool: whatever happens
// on our side - the store over quota, down, slow to answer garbage, or not
// configured - the reply is the same empty 204. A beacon never surfaces a
// response to the page, and the server must not give it one worth surfacing.
// Lives here, not beside the function: every .ts file under api/ deploys.

const report = {
  area: 'drafts',
  name: 'TypeError',
  stack: ['A.1b.js:1:2', 'B.2c.js:3:4'],
  step: 'export',
  tool: '/sign/',
  installed: false,
  sw: true,
  age: 'under_10s',
};
const body = JSON.stringify(report);
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

  it('answers 204 without calling out when the body is over the byte limit', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const big = JSON.stringify({ ...report, name: 'A'.repeat(3000) });
    const res = await POST(new Request('https://pdkef.com/api/report', { method: 'POST', body: big }));
    expect(res.status).toBe(204);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stores exactly one sample, with only the sample keys', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), { status: 200 }));
    expect((await post()).status).toBe(204);
    const commands = fetchSpy.mock.calls.flatMap(([, init]) => JSON.parse(init.body));
    const hsets = commands.filter(([name]) => name === 'HSET');
    expect(hsets).toHaveLength(1);
    expect(Object.keys(JSON.parse(hsets[0][3])).sort()).toEqual(
      ['age', 'engine', 'installed', 'stack', 'step', 'sw', 'tool'],
    );
  });

  it('answers an empty 204 to junk, and 405 only to a method no beacon uses', async () => {
    const junk = await POST(new Request('https://pdkef.com/api/report', { method: 'POST', body: '{' }));
    expect(junk.status).toBe(204);
    expect(GET().status).toBe(405);
  });

  describe('maintenance events', () => {
    const event = { name: 'sign_form_detection', properties: { outcome: 'failure', error_code: 'not_started' } };
    const postJson = (value) =>
      POST(
        new Request('https://pdkef.com/api/report', {
          method: 'POST',
          headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Safari/604.1' },
          body: JSON.stringify(value),
        }),
      );

    it('runs the cap pipeline, then exactly one HINCRBY and no HSET', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), { status: 200 }));
      expect((await postJson(event)).status).toBe(204);
      const calls = fetchSpy.mock.calls.map(([, init]) => JSON.parse(init.body));
      expect(calls).toHaveLength(2);
      expect(calls[0][0][0]).toBe('INCR');
      const commands = calls.flat();
      expect(commands.filter(([name]) => name === 'HSET')).toHaveLength(0);
      const hincrbys = commands.filter(([name]) => name === 'HINCRBY');
      expect(hincrbys).toHaveLength(1);
      expect(hincrbys[0][1]).toMatch(/^events:\d{4}-\d{2}-\d{2}$/);
      expect(hincrbys[0][2]).toBe('sign_form_detection|failure|not_started|ios-17');
    });

    const rejected = {
      'an extra property': { ...event, properties: { ...event.properties, note: 'x' } },
      'an unknown error_code': { ...event, properties: { outcome: 'failure', error_code: 'boom' } },
      'a success with an error_code': { ...event, properties: { outcome: 'success', error_code: 'not_started' } },
      'both report and event keys': { ...report, ...event },
    };
    for (const [what, value] of Object.entries(rejected)) {
      it(`answers 204 without calling out for ${what}`, async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        expect((await postJson(value)).status).toBe(204);
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    }
  });
});
