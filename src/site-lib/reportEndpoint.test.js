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
  actions: [],
};
const body = JSON.stringify(report);
const post = () => POST(new Request('https://pdkef.com/api/report', { method: 'POST', body }));
// Answers every pipeline with `total` as the first reply (the INCR), then filler.
const answerTotal = (total) => async () => new Response(JSON.stringify([{ result: total }, { result: 1 }]), { status: 200 });
const sentPipelines = (spy) => spy.mock.calls.map(([, init]) => JSON.parse(init.body));
// The caps are per warm instance; a fresh module is a fresh instance.
const freshPoster = async (make) => {
  vi.resetModules();
  const { POST: fresh } = await import('../../api/report.ts');
  return (value) => fresh(make(value));
};
// The fields HINCRBY'd on rejects:<day>, across every pipeline sent.
const rejectCounts = (spy) =>
  sentPipelines(spy).flat().filter(([name, key]) => name === 'HINCRBY' && String(key).startsWith('rejects:')).map(([, , field]) => field);
const jsonRequest = (value) => new Request('https://pdkef.com/api/report', { method: 'POST', body: JSON.stringify(value) });

// What each path sends: [INCR], then (first count of the day: EXPIRE on the total, then) the counting commands.
function expiryContract(label, totalPrefix, value, countingFirst) {
  describe(`${label}: the day total expires once`, () => {
    beforeEach(() => {
      process.env.KV_REST_API_URL = 'https://store.invalid';
      process.env.KV_REST_API_TOKEN = 'test-token';
    });
    afterEach(() => {
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
      vi.restoreAllMocks();
    });
    const totalKey = expect.stringMatching(new RegExp(`^${totalPrefix}:total:\\d{4}-\\d{2}-\\d{2}$`));

    it('first count of the day (INCR returns 1) sends the EXPIRE on the total with the counting pipeline', async () => {
      const send = await freshPoster(jsonRequest);
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(answerTotal(1));
      await send(value);
      const [cap, counting] = sentPipelines(spy);
      expect(cap).toEqual([['INCR', totalKey]]);
      expect(counting[0]).toEqual(['EXPIRE', totalKey, 7776000]);
      expect(counting[1][0]).toBe(countingFirst);
    });

    it('a later count (INCR returns 7) sends no EXPIRE on the total', async () => {
      const send = await freshPoster(jsonRequest);
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(answerTotal(7));
      await send(value);
      const [cap, counting] = sentPipelines(spy);
      expect(cap).toEqual([['INCR', totalKey]]);
      expect(counting[0][0]).toBe(countingFirst);
      expect(JSON.stringify(counting)).not.toContain(':total:');
    });

    it('past the cap sends exactly one command', async () => {
      const send = await freshPoster(jsonRequest);
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(answerTotal(3001));
      await send(value);
      expect(sentPipelines(spy)).toEqual([[['INCR', totalKey]]]);
    });
  });
}

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

  it('answers 204 and counts a body over the byte limit as an oversize reject', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(answerTotal(1));
    const big = JSON.stringify({ ...report, name: 'A'.repeat(3000) });
    const res = await POST(new Request('https://pdkef.com/api/report', { method: 'POST', body: big }));
    expect(res.status).toBe(204);
    expect(rejectCounts(fetchSpy)).toEqual(['oversize|other']);
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
      ['actions', 'age', 'engine', 'installed', 'stack', 'step', 'sw', 'tool'],
    );
  });

  it('counts an older build\'s eight-key report, storing an empty actions list', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), { status: 200 }));
    const { actions: _drop, ...old } = report;
    expect((await POST(new Request('https://pdkef.com/api/report', { method: 'POST', body: JSON.stringify(old) }))).status).toBe(204);
    const commands = fetchSpy.mock.calls.flatMap(([, init]) => JSON.parse(init.body));
    const hsets = commands.filter(([name]) => name === 'HSET');
    expect(hsets).toHaveLength(1);
    expect(JSON.parse(hsets[0][3]).actions).toEqual([]);
  });

  it.each([
    ['an unknown action name', ['add_files', 'not_a_real_action']],
    ['11 names', Array(11).fill('add_files')],
  ])('answers 204 and counts %s as a bad_report reject, never as a report', async (_, actions) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(answerTotal(1));
    const res = await POST(new Request('https://pdkef.com/api/report', { method: 'POST', body: JSON.stringify({ ...report, actions }) }));
    expect(res.status).toBe(204);
    expect(rejectCounts(fetchSpy)).toEqual(['bad_report|other']);
    expect(JSON.stringify(sentPipelines(fetchSpy))).not.toContain('errors:');
  });

  it('answers an empty 204 to junk (counted as bad_json), and 405 only to a method no beacon uses', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(answerTotal(1));
    const junk = await POST(new Request('https://pdkef.com/api/report', { method: 'POST', body: '{' }));
    expect(junk.status).toBe(204);
    expect(await junk.text()).toBe('');
    expect(rejectCounts(fetchSpy)).toEqual(['bad_json|other']);
    expect(GET().status).toBe(405);
  });

  describe('rejected bodies', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Safari/604.1';
    const send = (send, text, headers = {}) =>
      send(new Request('https://pdkef.com/api/report', { method: 'POST', headers: { 'user-agent': ua, ...headers }, body: text }));
    const cases = {
      'bad_json|ios-17': '{',
      'bad_report|ios-17': JSON.stringify({ ...report, step: 'not a step!' }),
      'bad_drop|ios-17': JSON.stringify({ kind: 'dropped', area: 'nope' }),
      'bad_event|ios-17': JSON.stringify({ name: 'tool_result_ready', properties: { tool: 'nope' } }),
      'bad_other|ios-17': JSON.stringify({ hello: 'world' }),
      'oversize|ios-17': JSON.stringify({ ...report, name: 'A'.repeat(3000) }),
    };
    for (const [field, text] of Object.entries(cases)) {
      it(`counts ${field.split('|')[0]} with its engine, as rejects:<day> after rejects:total:<day>`, async () => {
        const poster = await freshPoster((t) => t);
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(answerTotal(1));
        expect((await send(poster, text)).status).toBe(204);
        const calls = sentPipelines(fetchSpy);
        expect(calls[0]).toEqual([['INCR', expect.stringMatching(/^rejects:total:\d{4}-\d{2}-\d{2}$/)]]);
        expect(calls[1][0][0]).toBe('EXPIRE');
        expect(calls[1].slice(1).map((c) => c[0])).toEqual(['HINCRBY', 'EXPIRE']);
        expect(calls[1][1][1]).toMatch(/^rejects:\d{4}-\d{2}-\d{2}$/);
        expect(calls[1][1][2]).toBe(field);
      });
    }

    it('counts an oversize content-length without reading the body', async () => {
      const poster = await freshPoster((t) => t);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(answerTotal(1));
      await send(poster, '{}', { 'content-length': '9999' });
      expect(rejectCounts(fetchSpy)).toEqual(['oversize|ios-17']);
    });

    it('past the reject cap counts nothing, and the next reject makes no store call', async () => {
      const poster = await freshPoster((t) => t);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(answerTotal(201));
      expect((await send(poster, '{')).status).toBe(204);
      expect(sentPipelines(fetchSpy)).toEqual([[['INCR', expect.stringMatching(/^rejects:total:/)]]]);
      expect((await send(poster, '{')).status).toBe(204);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('counts the 200th reject of the day', async () => {
      const poster = await freshPoster((t) => t);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(answerTotal(200));
      await send(poster, '{');
      expect(rejectCounts(fetchSpy)).toEqual(['bad_json|ios-17']);
    });

    it('makes no store call when the store is not configured', async () => {
      delete process.env.KV_REST_API_URL;
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      expect((await POST(new Request('https://pdkef.com/api/report', { method: 'POST', body: '{' }))).status).toBe(204);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('keeps the reject cap apart from the error cap', async () => {
      const poster = await freshPoster((t) => t);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
        const first = JSON.parse(init.body)[0][1];
        return new Response(JSON.stringify([{ result: first.startsWith('rejects:') ? 1 : 9999 }, { result: 1 }]), { status: 200 });
      });
      await send(poster, '{');
      expect(rejectCounts(fetchSpy)).toEqual(['bad_json|ios-17']);
    });
  });

  describe('drop records', () => {
    const drop = { kind: 'dropped', area: 'drafts', step: 'export', reason: 'ignored', type: 'DOMException', name: 'AbortError' };
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Safari/604.1';
    const postDrop = (poster) =>
      poster(new Request('https://pdkef.com/api/report', { method: 'POST', headers: { 'user-agent': ua }, body: JSON.stringify(drop) }));

    it('runs the error cap, then exactly one HINCRBY on drops:<day> and an EXPIRE, no HSET', async () => {
      const poster = await freshPoster((t) => t);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(answerTotal(1));
      expect((await postDrop(poster)).status).toBe(204);
      const calls = sentPipelines(fetchSpy);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual([['INCR', expect.stringMatching(/^errors:total:/)]]);
      expect(calls[1].map((c) => c[0])).toEqual(['EXPIRE', 'HINCRBY', 'EXPIRE']);
      expect(calls[1][1][1]).toMatch(/^drops:\d{4}-\d{2}-\d{2}$/);
      expect(calls[1][1][2]).toBe('drafts|export|ignored|DOMException|AbortError|-|ios-17');
      expect(JSON.stringify(calls)).not.toContain('rejects:');
    });

    it('past the error cap is not counted', async () => {
      const poster = await freshPoster((t) => t);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(answerTotal(1001));
      await postDrop(poster);
      expect(sentPipelines(fetchSpy)).toEqual([[['INCR', expect.stringMatching(/^errors:total:/)]]]);
    });
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
      expect(calls[0]).toEqual([['INCR', expect.stringMatching(/^errors:total:/)]]);
      const commands = calls.flat();
      expect(commands.filter(([name]) => name === 'HSET')).toHaveLength(0);
      const hincrbys = commands.filter(([name]) => name === 'HINCRBY');
      expect(hincrbys).toHaveLength(1);
      expect(hincrbys[0][1]).toMatch(/^events:\d{4}-\d{2}-\d{2}$/);
      expect(hincrbys[0][2]).toBe('sign_form_detection|failure|not_started|ios-17');
    });

    it('counts a detection success with its page kind into the field string', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), { status: 200 }));
      const success = { name: 'sign_form_detection', properties: { outcome: 'success', field_count_bucket: 'one_to_five', page_kind: 'image' } };
      expect((await postJson(success)).status).toBe(204);
      const hincrbys = fetchSpy.mock.calls.flatMap(([, init]) => JSON.parse(init.body)).filter(([name]) => name === 'HINCRBY');
      expect(hincrbys).toHaveLength(1);
      expect(hincrbys[0][2]).toBe('sign_form_detection|success|one_to_five|image|ios-17');
    });

    const rejected = {
      'an extra property': { ...event, properties: { ...event.properties, note: 'x' } },
      'an unknown error_code': { ...event, properties: { outcome: 'failure', error_code: 'boom' } },
      'a success with an error_code': { ...event, properties: { outcome: 'success', error_code: 'not_started' } },
      'both report and event keys': { ...report, ...event },
    };
    for (const [what, value] of Object.entries(rejected)) {
      it(`answers 204 and counts a reject, not an event, for ${what}`, async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(answerTotal(1));
        expect((await postJson(value)).status).toBe(204);
        expect(rejectCounts(fetchSpy).length).toBe(1);
        expect(JSON.stringify(sentPipelines(fetchSpy))).not.toMatch(/events:|errors:/);
      });
    }
  });

  describe('usage events', () => {
    const usage = { name: 'tool_result_ready', properties: { tool: 'merge' } };
    const postUsage = (value) =>
      POST(new Request('https://pdkef.com/api/report', { method: 'POST', body: JSON.stringify(value) }));
    const answer = (total) => async () => new Response(JSON.stringify([{ result: total }, { result: 1 }]), { status: 200 });

    it('runs the usage cap, then exactly one HINCRBY on usage:<day>, never errors:total', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(answer(1));
      expect((await postUsage(usage)).status).toBe(204);
      const calls = fetchSpy.mock.calls.map(([, init]) => JSON.parse(init.body));
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual([['INCR', expect.stringMatching(/^usage:total:\d{4}-\d{2}-\d{2}$/)]]);
      const commands = calls.flat();
      const hincrbys = commands.filter(([name]) => name === 'HINCRBY');
      expect(hincrbys).toHaveLength(1);
      expect(hincrbys[0][1]).toMatch(/^usage:\d{4}-\d{2}-\d{2}$/);
      expect(hincrbys[0][2]).toBe('tool_result_ready|merge');
      expect(JSON.stringify(commands)).not.toContain('errors:total');
    });

    // The caps are per warm instance; a fresh module is a fresh instance.
    const freshPost = async () => {
      vi.resetModules();
      const { POST: fresh } = await import('../../api/report.ts');
      return (value) => fresh(new Request('https://pdkef.com/api/report', { method: 'POST', body: JSON.stringify(value) }));
    };

    it('does not count past the usage cap, and the next event makes no store call', async () => {
      const send = await freshPost();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(answer(3001));
      expect((await send(usage)).status).toBe(204);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][1].body).not.toContain('HINCRBY');
      expect((await send(usage)).status).toBe(204);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps the two caps apart: a capped error day still counts usage, and the reverse', async () => {
      const respond = (capped) => async (_url, init) => {
        const first = JSON.parse(init.body)[0][1];
        return new Response(JSON.stringify([{ result: first.startsWith(capped) ? 9999 : 1 }, { result: 1 }]), { status: 200 });
      };
      const hincrbyKeys = (spy) =>
        spy.mock.calls.flatMap(([, init]) => JSON.parse(init.body)).filter(([name]) => name === 'HINCRBY').map(([, key]) => key.split(':')[0]);

      let send = await freshPost();
      let fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(respond('errors:'));
      await send(report);
      expect(hincrbyKeys(fetchSpy)).toEqual([]);
      await send(usage);
      expect(hincrbyKeys(fetchSpy)).toEqual(['usage']);

      send = await freshPost();
      fetchSpy.mockClear();
      fetchSpy.mockImplementation(respond('usage:'));
      await send(usage);
      expect(hincrbyKeys(fetchSpy)).toEqual([]);
      await send(report);
      expect(hincrbyKeys(fetchSpy)).toEqual(['errors']);
    });

    it('stores a build-stamped event under a three-part field', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(answer(1));
      const stamped = { name: 'tool_operation_failed', properties: { tool: 'redact', build: '08e10cf' } };
      expect((await postUsage(stamped)).status).toBe(204);
      const hincrbys = fetchSpy.mock.calls.flatMap(([, init]) => JSON.parse(init.body)).filter(([name]) => name === 'HINCRBY');
      expect(hincrbys).toEqual([['HINCRBY', expect.stringMatching(/^usage:\d{4}-\d{2}-\d{2}$/), 'tool_operation_failed|redact|08e10cf', 1]]);
    });

    it('counts an event with an extra property as a bad_event reject, not as usage', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(answer(1));
      const extra = { ...usage, properties: { ...usage.properties, note: 'x' } };
      expect((await postUsage(extra)).status).toBe(204);
      expect(rejectCounts(fetchSpy)).toEqual(['bad_event|other']);
    });
  });
});

expiryContract('error report', 'errors', report, 'HINCRBY');
expiryContract('Sign event', 'errors', { name: 'sign_form_detection', properties: { outcome: 'failure', error_code: 'not_started' } }, 'HINCRBY');
expiryContract('usage event', 'usage', { name: 'tool_result_ready', properties: { tool: 'merge' } }, 'HINCRBY');
