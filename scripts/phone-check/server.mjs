// Phone-check dev tool: serves a landing page at /__check/ and proxies everything else to the tool's server,
// injecting a script that sends what the tool produces (photos, pages, the PDF, hints) to CAPTURES on this
// machine. One link, https for the camera. Dev only; photos never leave the LAN and nothing here ships.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { createWriteStream, mkdirSync, readdirSync, readFileSync, appendFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS } from './checklist.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4400);
const ASTRO = Number(process.env.ASTRO_PORT || 4331);
const CAPTURES = resolve(process.env.CAPTURES || join(homedir(), '.pdkef-phone-check', 'captures'));
const send = (res, code, type, body) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
const safe = (s) => String(s || 'x').replace(/[^\w-]/g, '').slice(0, 60) || 'x';
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' };
const seq = {};

const certDir = process.env.CERT_DIR;
const make = certDir
  ? (h) => https.createServer({ key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) }, h)
  : http.createServer;

function status() {
  if (!existsSync(CAPTURES)) return [];
  return readdirSync(CAPTURES).sort().map((sid) => {
    const files = readdirSync(join(CAPTURES, sid)).filter((f) => f !== 'events.jsonl');
    return { sid, files: files.length };
  });
}

const server = make((req, res) => {
  const [path, query = ''] = (req.url || '/').split('?');
  if (path.startsWith('/__check')) {
    const p = new URLSearchParams(query);
    if (path === '/__check/shots.json') return send(res, 200, 'application/json', JSON.stringify(SHOTS));
    if (path === '/__check/status') return send(res, 200, 'application/json', JSON.stringify(status()));
    if (path === '/__check/inject.js') return send(res, 200, 'text/javascript', readFileSync(join(here, 'inject.js')));
    if (path === '/__check/event' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 2e5) req.destroy(); });
      req.on('end', () => {
        const dir = join(CAPTURES, safe(p.get('sid'))); mkdirSync(dir, { recursive: true });
        appendFileSync(join(dir, 'events.jsonl'), body.replace(/\n/g, ' ') + '\n'); send(res, 204, 'text/plain', '');
      });
      return;
    }
    if (path === '/__check/blob' && req.method === 'POST') {
      const sid = safe(p.get('sid')); const dir = join(CAPTURES, sid); mkdirSync(dir, { recursive: true });
      const n = (seq[sid] = (seq[sid] ?? readdirSync(dir).length) + 1);
      const type = p.get('type') || ''; const name = p.get('name') || '';
      const ext = EXT[type] || (name.match(/\.(\w{2,5})$/) || [])[1] || 'bin';
      const file = `${String(n).padStart(3, '0')}-${safe(p.get('kind'))}.${ext}`;
      const out = createWriteStream(join(dir, file));
      req.pipe(out);
      out.on('finish', () => { appendFileSync(join(dir, 'events.jsonl'), JSON.stringify({ t: Date.now(), type: 'file', file, name, mime: type }) + '\n'); send(res, 204, 'text/plain', ''); });
      return;
    }
    return send(res, 200, 'text/html; charset=utf-8', readFileSync(join(here, 'index.html')));
  }
  const up = http.request({ host: 'localhost', port: ASTRO, path: req.url, method: req.method, headers: { ...req.headers, 'accept-encoding': 'identity', host: `localhost:${ASTRO}` } }, (r) => {
    if (/text\/html/.test(String(r.headers['content-type'] || ''))) {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8').replace(/<head[^>]*>/, (m) => `${m}<script src="/__check/inject.js"></script>`);
        const headers = { ...r.headers, 'content-length': Buffer.byteLength(html) };
        delete headers['content-encoding'];
        res.writeHead(r.statusCode || 200, headers); res.end(html);
      });
      return;
    }
    res.writeHead(r.statusCode || 502, r.headers); r.pipe(res);
  });
  up.on('error', () => send(res, 502, 'text/plain', `the tool's server is not answering on ${ASTRO}`));
  req.pipe(up);
});

server.on('upgrade', (req, socket, head) => {
  const up = net.connect(ASTRO, 'localhost', () => {
    up.write([`${req.method} ${req.url} HTTP/1.1`, ...Object.entries({ ...req.headers, host: `localhost:${ASTRO}` }).map(([k, v]) => `${k}: ${v}`), '', ''].join('\r\n'));
    if (head.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

server.listen(PORT, '0.0.0.0', () => console.log(`phone-check on ${certDir ? 'https' : 'http'}://<LAN address>:${PORT}/__check/ ; captures: ${CAPTURES}`));
