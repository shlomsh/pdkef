import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, realpath, stat, chmod } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createOAuth } from './oauth.mjs';
import { analyzePage, validateRequest } from './analysis.mjs';

export async function loadHostId(root) {
  const dir = resolve(root, 'node_modules/.cache/ai-pdf-filler');
  await mkdir(dir, { recursive: true, mode: 0o700 }); await chmod(dir, 0o700);
  const path = resolve(dir, 'host.json');
  try {
    const data = JSON.parse(await readFile(path, 'utf8'));
    if (!/^urn:uuid:[0-9a-f-]{36}$/.test(data.hostId)) throw new Error('Invalid local host registration.');
    await chmod(path, 0o600); return data.hostId;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const hostId = `urn:uuid:${randomUUID()}`;
    await writeFile(path, JSON.stringify({ hostId }), { mode: 0o600, flag: 'wx' }); return hostId;
  }
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain' };
// Replace an existing production worker on this disposable origin, so it cannot
// cache OAuth callbacks/status. This worker has no fetch handler, and removes itself.
const recoveryWorker = `self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await Promise.all((await caches.keys()).map(key => caches.delete(key)));
  await self.clients.claim();
  await self.registration.unregister();
})()));`;
const safeMessages = new Set(['Invalid page image or facts.', 'ChatGPT analysis unavailable. Check access/usage or use manual mode.', 'AI returned an invalid proposal.', 'AI returned invalid field positions or answers.', 'AI returned an invalid checkbox answer.', 'AI returned invalid questions.', 'AI analysis did not complete. Try again or use manual mode.', 'AI analysis ended before completion.', 'AI returned invalid JSON. Try again or use manual mode.', 'ChatGPT authorization was declined. Manual mode remains available.', 'ChatGPT authorization could not be validated. Reconnect.', 'ChatGPT connection failed. Reconnect or use manual mode.', 'ChatGPT model catalog unavailable.']);
function send(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
export function createRunner({ dist, oauth, analyze = analyzePage, port = 1455 }) {
  const origin = `http://127.0.0.1:${port}`;
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin'); res.setHeader('X-Frame-Options', 'DENY');
    if (req.headers.host !== `127.0.0.1:${port}`) return send(res, 403, { error: 'Invalid local host.' });
    const controller = new AbortController();
    req.on('aborted', () => controller.abort()); res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      const url = new URL(req.url, origin);
      if (req.method === 'GET' && url.pathname === '/sw.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' });
        return res.end(recoveryWorker);
      }
      if (url.pathname.startsWith('/api/') || url.pathname === '/auth/start') {
        if ((req.headers.origin && req.headers.origin !== origin) || ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) return send(res, 403, { error: 'Use the local AI PDF Filler page.' });
      }
      if (req.method === 'GET' && url.pathname === '/api/ai/status') {
        const connected = Boolean(oauth.token());
        return send(res, 200, { localRunner: true, connected, models: connected ? await oauth.models() : [] });
      }
      if (req.method === 'GET' && url.pathname === '/auth/start') {
        res.writeHead(302, { Location: oauth.start(), 'Cache-Control': 'no-store' }); return res.end();
      }
      if (req.method === 'GET' && url.pathname === '/auth/callback') {
        await oauth.callback(url.searchParams);
        res.writeHead(303, { Location: '/ai-pdf-filler/', 'Cache-Control': 'no-store' }); return res.end();
      }
      if (url.pathname === '/api/ai/analyze' && req.method === 'POST') {
        if (req.headers.origin !== origin || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) return send(res, 403, { error: 'Use the local AI PDF Filler page.' });
        const token = oauth.token();
        if (!token) return send(res, 401, { error: 'Continue with ChatGPT to analyze, or use manual mode.' });
        let size = 0, chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 12500000) { send(res, 413, { error: 'Page image is too large.' }); return; } chunks.push(chunk); }
        let input; try { input = JSON.parse(Buffer.concat(chunks)); } catch { return send(res, 400, { error: 'Invalid analysis request.' }); }
        validateRequest(input);
        if (!(await oauth.models()).some(m => m.slug === input.model)) return send(res, 400, { error: 'Choose a model available to your ChatGPT account.' });
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]);
        return send(res, 200, await analyze(input, { token, signal }));
      }
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return send(res, 404, { error: 'Unknown local endpoint.' });
      if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' });
      const base = await realpath(dist);
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\0') || decoded.includes('\\')) return send(res, 404, { error: 'Not found.' });
      let path = resolve(base, `.${decoded}`);
      if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
      path = await realpath(path);
      const rel = relative(base, path);
      if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith(sep)) return send(res, 404, { error: 'Not found.' });
      const bytes = await readFile(path);
      res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (e) {
      if (res.destroyed || res.writableEnded) return;
      const message = safeMessages.has(e.message) ? e.message : 'Local AI request failed. Retry, reconnect, or use manual mode.';
      return send(res, e.code === 'ENOENT' ? 404 : 400, { error: message });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const hostId = await loadHostId(root);
  const server = createRunner({ dist: resolve(root, 'dist'), oauth: createOAuth({ hostId }) });
  server.on('error', () => { process.stderr.write('Local AI runner could not listen on 127.0.0.1:1455.\n'); process.exitCode = 1; });
  server.listen(1455, '127.0.0.1', () => process.stdout.write('Local exploration: http://127.0.0.1:1455/ai-pdf-filler/\nCredentials are process-only. No sign-in starts until you click Continue with ChatGPT.\n'));
}
