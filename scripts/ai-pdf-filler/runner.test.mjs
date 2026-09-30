import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOAuth, validateIdToken, CALLBACK } from './oauth.mjs';
import { analyzePage, validateRequest, validateResult, readResponseStream } from './analysis.mjs';
import { createRunner } from './server.mjs';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' };
const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
function jwt(claims, header = { alg: 'RS256', kid: 'test-key' }) {
  const data = `${encode(header)}.${encode({ iss: 'https://auth.openai.com', sub: 'user', aud: 'oaiapp_test', exp: 2000, nonce: 'nonce', ...claims })}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), keys.privateKey).toString('base64url')}`;
}
const image = { model: 'vision-test', image: 'data:image/png;base64,iVBORw0KGgo=', facts: 'Name: Ada', width: 100, height: 200 };
const result = { fields: [{ id: 'name', label: 'Name', kind: 'text', x: 10, y: 20, width: 80, height: 20, value: 'Ada' }], questions: [] };
const stream = events => new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`)); c.close(); } });
const events = [{ type: 'response.output_text.delta', delta: JSON.stringify(result) }, { type: 'response.completed', response: { status: 'completed' } }];

describe('local ChatGPT OAuth validation', () => {
  it('verifies signature, audience, issuer, expiry and nonce rather than trusting decoded claims', () => {
    expect(validateIdToken(jwt({}), [jwk], { clientId: 'oaiapp_test', nonce: 'nonce', now: 1000 }).sub).toBe('user');
    for (const overrides of [{ nonce: 'other' }, { aud: 'other' }, { iss: 'https://attacker.test' }, { exp: 900 }, { sub: '' }])
      expect(() => validateIdToken(jwt(overrides), [jwk], { clientId: 'oaiapp_test', nonce: 'nonce', now: 1000 })).toThrow();
    expect(() => validateIdToken(jwt({}, { alg: 'none', kid: 'test-key' }), [jwk], { clientId: 'oaiapp_test', nonce: 'nonce', now: 1000 })).toThrow();
    const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'jwk' });
    expect(() => validateIdToken(jwt({}), [{ ...wrongKey, kid: 'test-key' }], { clientId: 'oaiapp_test', nonce: 'nonce', now: 1000 })).toThrow();
  });
  it('exchanges only issued registration ID and identical PKCE callback, checks granted scope', async () => {
    let authorize, exchange, calls = 0, granted = 'openid resource.invoke chatgpt.tokens.use.direct';
    const oauth = createOAuth({ hostId: 'urn:uuid:test', now: () => 1000000, fetchImpl: async (url, options) => {
      calls++;
      if (url.endsWith('/oauth/token')) {
        exchange = options.body;
        return Response.json({ token_type: 'Bearer', access_token: 'fake-test-token', expires_in: 3600, scope: granted,
          id_token: jwt({ nonce: authorize.searchParams.get('nonce') }) });
      }
      if (url.endsWith('/jwks.json')) return Response.json({ keys: [jwk] });
      return Response.json({ models: [{ slug: 'vision-test', display_name: 'Vision test' }] });
    } });
    authorize = new URL(oauth.start());
    expect(authorize.searchParams.get('redirect_uri')).toBe(CALLBACK);
    await expect(oauth.callback(new URLSearchParams({ state: 'wrong', code: 'x', client_id: 'oaiapp_test' }))).rejects.toThrow();
    expect(calls).toBe(0);
    await oauth.callback(new URLSearchParams({ state: authorize.searchParams.get('state'), code: 'x', client_id: 'oaiapp_test' }));
    expect(exchange.get('client_id')).toBe('oaiapp_test'); expect(exchange.get('redirect_uri')).toBe(CALLBACK);
    expect(exchange.get('code_verifier')).toBeTruthy(); expect(oauth.token()).toBe('fake-test-token');
    expect(await oauth.models()).toEqual([{ slug: 'vision-test', display_name: 'Vision test' }]);
    authorize = new URL(oauth.start()); expect(authorize.searchParams.get('client_id')).toBe('oaiapp_test');
    expect(authorize.searchParams.has('agent_name_hint')).toBe(false);
    await expect(oauth.callback(new URLSearchParams({ state: authorize.searchParams.get('state'), code: 'x', client_id: 'oaiapp_other' }))).rejects.toThrow();
    authorize = new URL(oauth.start()); granted = 'openid';
    await expect(oauth.callback(new URLSearchParams({ state: authorize.searchParams.get('state'), code: 'x' }))).rejects.toThrow();
  });
  it('requires an issued client ID and consumes valid denied attempts without token exchange', async () => {
    let calls = 0;
    const oauth = createOAuth({ hostId: 'urn:uuid:test', fetchImpl: async () => { calls++; throw new Error('must not fetch'); } });
    let url = new URL(oauth.start());
    await expect(oauth.callback(new URLSearchParams({ state: url.searchParams.get('state'), code: 'x' }))).rejects.toThrow();
    url = new URL(oauth.start());
    await expect(oauth.callback(new URLSearchParams({ state: url.searchParams.get('state'), error: 'access_denied' }))).rejects.toThrow('declined');
    expect(calls).toBe(0);
  });
});

describe('bounded page inference', () => {
  it('uses streamed nonstored array-input Responses and returns only validated proposal fields', async () => {
    let sent;
    const parsed = await analyzePage(image, { token: 'fake', fetchImpl: async (url, options) => { sent = { url, body: JSON.parse(options.body) }; return new Response(stream(events)); } });
    expect(parsed).toEqual(result); expect(sent.url).toBe('https://api.openai.com/v1/responses');
    expect(sent.body.store).toBe(false); expect(sent.body.stream).toBe(true); expect(Array.isArray(sent.body.input)).toBe(true);
    expect(sent.body).not.toHaveProperty('max_output_tokens');
    expect(() => validateRequest({ ...image, image: 'https://attacker.test/image' })).toThrow();
    expect(() => validateResult({ ...result, fields: [{ ...result.fields[0], x: 90 }] }, image)).toThrow();
    expect(() => validateResult({ ...result, fields: [result.fields[0], result.fields[0]] }, image)).toThrow();
  });
  it('rejects incomplete/failed/malformed streams and cancels reader on browser abort', async () => {
    await expect(readResponseStream(stream(events.slice(0, 1)))).rejects.toThrow('before completion');
    await expect(readResponseStream(stream([{ type: 'response.failed' }]))).rejects.toThrow('did not complete');
    await expect(readResponseStream(stream([{ type: 'response.output_text.delta', delta: '{}' }, events[1]]))).resolves.toEqual({});
    const bad = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: no-json\n\n')); c.close(); } });
    await expect(readResponseStream(bad)).rejects.toThrow('malformed');
    const splitCRLF = new ReadableStream({ start(c) {
      const payload = events.map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join('');
      for (const character of payload) c.enqueue(new TextEncoder().encode(character));
      c.close();
    } });
    expect(await readResponseStream(splitCRLF)).toEqual(result);
    expect(await readResponseStream(stream([
      { type: 'response.output_text.delta', delta: '{"fields":[],"questions":[]}' },
      { type: 'response.completed', response: { status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }] } },
    ]))).toEqual(result);
    let cancelled = false; const controller = new AbortController();
    const pending = readResponseStream(new ReadableStream({ cancel() { cancelled = true; } }), controller.signal);
    controller.abort(); await expect(pending).rejects.toThrow(); expect(cancelled).toBe(true);
  });
});

describe('loopback server boundaries', () => {
  it('rejects cross-origin mutations and symlink escape while preserving safe status and static files', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'ai-runner-test-'));
    const dist = join(temp, 'dist'); await mkdir(dist); await writeFile(join(dist, 'index.html'), '<p>local</p>');
    await writeFile(join(dist, 'pdf.worker.mjs'), 'export {};');
    await writeFile(join(dist, 'font.wasm'), 'wasm-test');
    await writeFile(join(dist, 'font.ttf'), 'font-test');
    await writeFile(join(dist, 'font.woff2'), 'font-test');
    await writeFile(join(temp, 'secret.txt'), 'outside-dist-secret'); await symlink(join(temp, 'secret.txt'), join(dist, 'escape.txt'));
    const port = 21455;
    const server = createRunner({ dist, port, oauth: { token: () => 'fake-token', models: async () => [{ slug: 'vision-test', display_name: 'Vision' }] }, analyze: async () => result });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${port}`;
    try {
      expect(await (await fetch(base)).text()).toContain('local');
      expect((await fetch(`${base}/pdf.worker.mjs`)).headers.get('content-type')).toBe('text/javascript');
      expect((await fetch(`${base}/font.wasm`)).headers.get('content-type')).toBe('application/wasm');
      expect((await fetch(`${base}/font.ttf`)).headers.get('content-type')).toBe('font/ttf');
      expect((await fetch(`${base}/font.woff2`)).headers.get('content-type')).toBe('font/woff2');
      const statusResponse = await fetch(`${base}/api/ai/status`);
      expect(statusResponse.headers.get('cache-control')).toBe('no-store');
      const status = await statusResponse.json(); expect(status.connected).toBe(true); expect(JSON.stringify(status)).not.toContain('fake-token');
      const worker = await fetch(`${base}/sw.js`); expect(worker.headers.get('cache-control')).toBe('no-store');
      const workerSource = await worker.text(); expect(workerSource).toContain('registration.unregister');
      expect(workerSource).toContain('caches.delete'); expect(workerSource).not.toContain("addEventListener('fetch'");
      expect((await fetch(`${base}/escape.txt`)).status).toBe(404);
      expect((await fetch(`${base}/api/ai/analyze`, { method: 'POST', headers: { Origin: 'https://attacker.test', 'Content-Type': 'application/json' }, body: JSON.stringify(image) })).status).toBe(403);
      expect(await (await fetch(`${base}/api/ai/analyze`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(image) })).json()).toEqual(result);
    } finally { await new Promise(resolve => server.close(resolve)); await rm(temp, { recursive: true, force: true }); }
  });
});
