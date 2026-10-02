import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';

/*
 * MEM-10: a static server over dist/ that can pretend a deploy happened. There
 * is only one build on disk, so "deploying" flips a phase: in 'new', /sw.js is
 * served with a different build id (the browser sees new worker bytes and
 * installs a waiting update) and every HTML response carries a marker meta tag
 * saying which build rendered it. MEM-13: phase 'critical' is the same deploy
 * plus a bumped CRITICAL_VERSION (the cache key's `c<N>-` segment and the
 * version the worker compares with), the build that forces every open tab.
 * Port 0 keeps it off every other spec's
 * origin, so its service worker registration is isolated too.
 */

const DIST = resolve(process.cwd(), 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

async function isDirectory(path) {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

async function isFile(path) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

// The built worker names its cache `${CACHE_PREFIX}c<N>-<hash>`, and the
// minifier folds CRITICAL_VERSION into that name and into the one
// isCriticalOver(<N>, ...) call, leaving the const only as a dead literal. A
// deploy changes the hash; a critical deploy also raises N in the cache name
// and in that call, so the worker behaves as if its source constant were
// bumped. Throws when the built worker no longer has these shapes, so a
// refactor cannot turn every phase into the old build without a word.
function deployed(source, critical) {
  const cacheName = /((?:\$\{CACHE_PREFIX\}|pdkef-)c)(\d+)(-[0-9a-f]{6,})/;
  if (!cacheName.test(source)) throw new Error('twoBuildServer: no cache name in dist/sw.js');
  let out = source.replace(cacheName, (_m, lead, n, id) => `${lead}${critical ? Number(n) + 1 : n}${id}e2e`);
  if (critical) {
    const compared = /(isCriticalOver\()(\d+)(,)/;
    if (!compared.test(out)) throw new Error('twoBuildServer: no isCriticalOver(<version>, ...) call in dist/sw.js');
    out = out.replace(compared, (_m, lead, n, tail) => `${lead}${Number(n) + 1}${tail}`);
  }
  return out;
}

export async function startTwoBuildServer() {
  let phase = 'old';

  const send = (res, status, body, type, extra = {}) => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache', ...extra });
    res.end(body);
  };

  const sendHtml = async (res, file, status) => {
    const html = (await readFile(file, 'utf8')).replace(
      /<head[^>]*>/i,
      (head) => `${head}<meta name="pdkef-e2e-build" content="${phase}">`,
    );
    send(res, status, html, TYPES['.html']);
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      const target = normalize(join(DIST, pathname));
      if (!target.startsWith(DIST)) return send(res, 403, 'forbidden', TYPES['.txt']);

      if (pathname === '/sw.js' && (await isFile(target))) {
        let source = await readFile(target, 'utf8');
        if (phase !== 'old') source = deployed(source, phase === 'critical');
        return send(res, 200, source, TYPES['.js'], { 'Service-Worker-Allowed': '/' });
      }
      if (await isDirectory(target)) {
        if (!pathname.endsWith('/')) {
          return send(res, 308, '', TYPES['.txt'], { Location: `${pathname}/${url.search}` });
        }
        const index = join(target, 'index.html');
        if (await isFile(index)) return sendHtml(res, index, 200);
      } else if (await isFile(target)) {
        if (extname(target) === '.html') return sendHtml(res, target, 200);
        return send(res, 200, await readFile(target), TYPES[extname(target)] ?? 'application/octet-stream');
      }
      return sendHtml(res, join(DIST, '404.html'), 404);
    } catch (error) {
      send(res, 500, String(error), TYPES['.txt']);
    }
  });

  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    setPhase(next) { phase = next; },
    close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(done); }),
  };
}
